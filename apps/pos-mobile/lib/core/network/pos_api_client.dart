import 'dart:convert';
import 'package:http/http.dart' as http;

class PosApiException implements Exception {
  final String message;
  final int? statusCode;
  final bool isNetworkError;

  PosApiException(
    this.message, {
    this.statusCode,
    this.isNetworkError = false,
  });

  @override
  String toString() => message;
}

class PosApiClient {
  String baseUrl;
  String? deviceToken;
  String? organizationId;
  String? storeId;

  PosApiClient({
    required this.baseUrl,
    this.deviceToken,
    this.organizationId,
    this.storeId,
  });

  String get _cleanBase => baseUrl.endsWith('/')
      ? baseUrl.substring(0, baseUrl.length - 1)
      : baseUrl;

  Map<String, String> _headers({
    bool auth = true,
    Map<String, String>? extra,
  }) {
    final h = <String, String>{
      'Content-Type': 'application/json',
    };
    if (auth && deviceToken != null && deviceToken!.isNotEmpty) {
      h['Authorization'] = 'Bearer $deviceToken';
    }
    if (organizationId != null && organizationId!.isNotEmpty) {
      h['X-Organization-Id'] = organizationId!;
    }
    if (storeId != null && storeId!.isNotEmpty) {
      h['X-Store-ID'] = storeId!;
    }
    if (extra != null) h.addAll(extra);
    return h;
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
    Map<String, String>? extraHeaders,
    Duration timeout = const Duration(seconds: 8),
  }) async {
    final uri = Uri.parse('$_cleanBase$path');
    final headers = _headers(auth: auth, extra: extraHeaders);

    http.Response res;
    try {
      if (method == 'GET') {
        res = await http.get(uri, headers: headers).timeout(timeout);
      } else if (method == 'POST') {
        res = await http
            .post(
              uri,
              headers: headers,
              body: body != null ? jsonEncode(body) : null,
            )
            .timeout(timeout);
      } else {
        throw PosApiException('Unsupported method $method');
      }
    } catch (e) {
      throw PosApiException(
        'Không thể kết nối máy chủ: $e',
        isNetworkError: true,
      );
    }

    Map<String, dynamic> decoded = {};
    try {
      decoded = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {}

    if (res.statusCode < 200 || res.statusCode >= 300 || decoded['success'] == false) {
      final msg = decoded['message']?.toString() ??
          decoded['detail']?.toString() ??
          'Lỗi máy chủ (${res.statusCode})';
      throw PosApiException(msg, statusCode: res.statusCode);
    }

    return decoded.containsKey('data') ? decoded['data'] : decoded;
  }

  Future<Map<String, dynamic>> createPairingSession() async {
    final data = await _request(
      'POST',
      '/api/v1/devices/pairing-session',
      auth: false,
      body: {
        'device_info': {
          'device_model': 'Android POS Smart Terminal (Flutter APK)',
          'os': 'Android',
          'app_version': '1.0.0',
        },
      },
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> pollPairingSession(String sessionId) async {
    final data = await _request(
      'GET',
      '/api/v1/devices/pairing-session/$sessionId',
      auth: false,
      timeout: const Duration(seconds: 4),
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> checkDeviceStatus(String deviceId) async {
    final data = await _request(
      'GET',
      '/api/v1/devices/check-status/$deviceId',
      auth: false,
      timeout: const Duration(seconds: 4),
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> fetchBootstrap(String targetStoreId) async {
    final data = await _request(
      'GET',
      '/api/v1/pos/bootstrap?store_id=${Uri.encodeComponent(targetStoreId)}',
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<List<dynamic>> fetchInventory(String targetStoreId) async {
    final data = await _request(
      'GET',
      '/api/v1/inventory?store_id=${Uri.encodeComponent(targetStoreId)}',
    );
    if (data is List) return data;
    if (data is Map && data['items'] is List) return data['items'] as List;
    return [];
  }

  Future<List<dynamic>> fetchOrders(String targetStoreId) async {
    final data = await _request(
      'GET',
      '/api/v1/orders?store_id=${Uri.encodeComponent(targetStoreId)}',
    );
    if (data is List) return data;
    if (data is Map && data['items'] is List) return data['items'] as List;
    return [];
  }

  Future<Map<String, dynamic>> openCashSession(String targetStoreId) async {
    final drawersRaw = await _request(
      'GET',
      '/api/v1/cash-drawers?store_id=${Uri.encodeComponent(targetStoreId)}',
    );
    final drawers = drawersRaw is List
        ? drawersRaw
        : (drawersRaw is Map && drawersRaw['items'] is List
            ? drawersRaw['items'] as List
            : []);

    String drawerId;
    if (drawers.isNotEmpty) {
      drawerId = drawers.first['id'].toString();
    } else {
      final created = await _request(
        'POST',
        '/api/v1/cash-drawers',
        body: {
          'store_id': targetStoreId,
          'code': 'DRW-${DateTime.now().millisecondsSinceEpoch.toString().substring(9)}',
          'name': 'Ngăn kéo thu ngân POS Android',
        },
      );
      drawerId = (created as Map)['id'].toString();
    }

    final session = await _request(
      'POST',
      '/api/v1/cash-sessions/open',
      body: {
        'store_id': targetStoreId,
        'cash_drawer_id': drawerId,
        'opening_amount': '1000000.0000',
      },
    );
    return Map<String, dynamic>.from(session as Map);
  }

  Future<Map<String, dynamic>> createOrder({
    required String targetStoreId,
    required String clientOrderId,
    required String idempotencyKey,
    required List<Map<String, dynamic>> items,
    required String paymentMethodCode,
    required int paidAmount,
  }) async {
    final data = await _request(
      'POST',
      '/api/v1/orders',
      extraHeaders: {'Idempotency-Key': idempotencyKey},
      body: {
        'store_id': targetStoreId,
        'client_order_id': clientOrderId,
        'items': items,
        'payments': [
          {
            'payment_method_code': paymentMethodCode,
            'amount': '$paidAmount.0000',
          }
        ],
      },
    );
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> pushOutboxBatch({
    required String deviceId,
    required String targetStoreId,
    required String batchId,
    required List<Map<String, dynamic>> events,
  }) async {
    final data = await _request(
      'POST',
      '/api/v1/sync/push',
      body: {
        'device_id': deviceId,
        'store_id': targetStoreId,
        'batch_id': batchId,
        'events': events,
      },
    );
    return Map<String, dynamic>.from(data as Map);
  }
}
