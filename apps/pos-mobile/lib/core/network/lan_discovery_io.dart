import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

Future<bool> _isPosServerAlive(String baseUrl) async {
  final clean = baseUrl.endsWith('/')
      ? baseUrl.substring(0, baseUrl.length - 1)
      : baseUrl;
  try {
    final res = await http
        .get(Uri.parse('$clean/api/v1/health/live'))
        .timeout(const Duration(milliseconds: 1600));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      final decoded = jsonDecode(res.body);
      return decoded is Map && decoded['success'] == true;
    }
  } catch (_) {}
  return false;
}

Future<String?> _udpBroadcastDiscover() async {
  RawDatagramSocket? socket;
  try {
    socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
    socket.broadcastEnabled = true;

    final completer = Completer<String?>();
    final sub = socket.listen((event) {
      if (event != RawSocketEvent.read || completer.isCompleted) return;
      final dg = socket?.receive();
      if (dg == null) return;
      try {
        final raw = utf8.decode(dg.data);
        final json = jsonDecode(raw);
        if (json is Map &&
            json['service'] == 'pos-platform' &&
            json['server_url'] != null) {
          completer.complete(json['server_url'].toString());
        }
      } catch (_) {}
    });

    final targets = <InternetAddress>{
      InternetAddress('255.255.255.255'),
      InternetAddress('10.0.2.2'),
    };

    try {
      final ifaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLinkLocal: false,
      );
      for (final iface in ifaces) {
        for (final addr in iface.addresses) {
          final parts = addr.address.split('.');
          if (parts.length == 4 && !addr.isLoopback) {
            targets.add(
              InternetAddress('${parts[0]}.${parts[1]}.${parts[2]}.255'),
            );
          }
        }
      }
    } catch (_) {}

    final payload = utf8.encode('POS_DISCOVER_V1');
    for (final target in targets) {
      try {
        socket.send(payload, target, 13535);
      } catch (_) {}
    }

    final result = await completer.future.timeout(
      const Duration(milliseconds: 1500),
      onTimeout: () => null,
    );
    await sub.cancel();
    if (result != null && await _isPosServerAlive(result)) {
      return result;
    }
  } catch (_) {
  } finally {
    socket?.close();
  }
  return null;
}

Future<String?> discoverPosServerUrl({String? currentUrl}) async {
  // 1. Fast-path: check current configured URL
  if (currentUrl != null && currentUrl.trim().isNotEmpty) {
    if (await _isPosServerAlive(currentUrl.trim())) {
      return currentUrl.trim();
    }
  }

  // 2. Real LAN UDP broadcast discovery (Docker pos-lan-discovery host service)
  final udpFound = await _udpBroadcastDiscover();
  if (udpFound != null) {
    return udpFound;
  }

  // 3. Smart fallbacks (Android Emulator host loopback + common mDNS hostname)
  const candidates = [
    'http://10.0.2.2:13000',
    'http://pos-server.local:13000',
  ];
  for (final candidate in candidates) {
    if (candidate != currentUrl && await _isPosServerAlive(candidate)) {
      return candidate;
    }
  }

  return null;
}
