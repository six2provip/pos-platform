import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'core/network/pos_api_client.dart';
import 'core/storage/local_pos_db.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PosApkApp());
}

const Color kEmeraldPrimary = Color(0xFF059669);
const Color kEmeraldDark = Color(0xFF047857);
const Color kMintSoft = Color(0xFFE6F6F0);
const Color kDarkKioskBg = Color(0xFF0B0F17);
const Color kDarkPanelBg = Color(0xFF111827);
const Color kCanvasBg = Color(0xFFF6F8FA);

String formatVnd(num amount) {
  final str = amount.round().toString();
  final buf = StringBuffer();
  for (var i = 0; i < str.length; i++) {
    final revIdx = str.length - i;
    buf.write(str[i]);
    if (revIdx > 1 && revIdx % 3 == 1) {
      buf.write('.');
    }
  }
  return '${buf.toString()}₫';
}

class PosApkApp extends StatelessWidget {
  const PosApkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Máy POS Android',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: kCanvasBg,
        colorScheme: ColorScheme.fromSeed(
          seedColor: kEmeraldPrimary,
          primary: kEmeraldPrimary,
          surface: Colors.white,
        ),
      ),
      home: const PosTerminalRoot(),
    );
  }
}

class CartEntry {
  final String variantId;
  final String productName;
  final String variantName;
  final String sku;
  final int price;
  int quantity;

  CartEntry({
    required this.variantId,
    required this.productName,
    required this.variantName,
    required this.sku,
    required this.price,
    this.quantity = 1,
  });
}

class PosTerminalRoot extends StatefulWidget {
  const PosTerminalRoot({super.key});

  @override
  State<PosTerminalRoot> createState() => _PosTerminalRootState();
}

class _PosTerminalRootState extends State<PosTerminalRoot> {
  static const String _defaultServerUrl = 'http://192.168.1.14:13000';
  static const int _maxOfflineOrders = 30;
  static const int _maxOfflineAmount = 5000000;
  static const int _defaultGraceSeconds = 7200;

  final Uuid _uuid = const Uuid();
  late final PosApiClient _api;

  bool _initializing = true;
  bool _busy = false;
  String _serverUrl = _defaultServerUrl;

  // Pairing state
  bool _isPaired = false;
  String? _sessionId;
  String _pairingCode = '------';
  int _pairingSecondsLeft = 900;

  // Bound device state
  Map<String, dynamic>? _device;
  Map<String, dynamic>? _store;
  Map<String, dynamic>? _org;

  // Security & Offline Guard
  bool _isRevoked = false;
  String _revocationReason = '';
  String _revocationTime = '';
  bool _offlineMode = false;
  int _offlineGraceSeconds = _defaultGraceSeconds;
  bool _isOfflineGraceExpired = false;

  // Cashier state
  List<Map<String, dynamic>> _variants = [];
  List<Map<String, dynamic>> _orders = [];
  List<Map<String, dynamic>> _outboxQueue = [];
  Map<String, dynamic>? _activeCashSession;
  final List<CartEntry> _cart = [];
  String _searchQuery = '';
  String _paymentMethod = 'CASH';
  int _mobileTabIndex = 0; // 0: Menu, 1: Cart, 2: Orders

  Timer? _pairingPollTimer;
  Timer? _pairingCountdownTimer;
  Timer? _heartbeatTimer;
  Timer? _graceTimer;

  @override
  void initState() {
    super.initState();
    _api = PosApiClient(baseUrl: _serverUrl);
    _bootstrapFromStorage();
  }

  @override
  void dispose() {
    _stopAllTimers();
    super.dispose();
  }

  void _stopAllTimers() {
    _pairingPollTimer?.cancel();
    _pairingCountdownTimer?.cancel();
    _heartbeatTimer?.cancel();
    _graceTimer?.cancel();
  }

  Future<void> _bootstrapFromStorage() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString('pos_server_url') ?? _defaultServerUrl;
    _serverUrl = savedUrl;
    _api.baseUrl = savedUrl;

    final devStr = prefs.getString('pos_paired_device');
    final storeStr = prefs.getString('pos_paired_store');
    final orgStr = prefs.getString('pos_paired_org');
    final token = prefs.getString('pos_device_token');

    if (devStr != null && storeStr != null && token != null) {
      _device = jsonDecode(devStr) as Map<String, dynamic>;
      _store = jsonDecode(storeStr) as Map<String, dynamic>;
      if (orgStr != null) _org = jsonDecode(orgStr) as Map<String, dynamic>;
      _api.deviceToken = token;
      _api.organizationId = _org?['id']?.toString();
      _api.storeId = _store?['id']?.toString();
      _isPaired = true;

      // Load offline SQLite cache immediately
      _variants = await LocalPosDb.instance.loadCatalogVariants();
      _outboxQueue = await LocalPosDb.instance.loadPendingOutboxEvents();

      setState(() => _initializing = false);
      _startPairedGuards();
      await _refreshTerminalData();
    } else {
      setState(() => _initializing = false);
      await _requestPairingSession();
    }
  }

  Future<void> _requestPairingSession() async {
    _pairingPollTimer?.cancel();
    _pairingCountdownTimer?.cancel();
    setState(() {
      _busy = true;
      _pairingCode = '------';
    });

    try {
      final data = await _api.createPairingSession();
      if (!mounted) return;
      setState(() {
        _sessionId = data['session_id']?.toString();
        _pairingCode = data['pairing_code']?.toString() ?? '------';
        _pairingSecondsLeft =
            int.tryParse(data['expires_in_seconds']?.toString() ?? '900') ?? 900;
        _busy = false;
      });
      _startPairingTimers();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _showSnack('Không kết nối được server $_serverUrl: $e', isError: true);
    }
  }

  void _startPairingTimers() {
    _pairingCountdownTimer?.cancel();
    _pairingCountdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _isPaired) return;
      if (_pairingSecondsLeft <= 1) {
        _requestPairingSession();
      } else {
        setState(() => _pairingSecondsLeft--);
      }
    });

    _pairingPollTimer?.cancel();
    _pairingPollTimer = Timer.periodic(const Duration(milliseconds: 1500), (_) async {
      if (!mounted || _isPaired || _sessionId == null) return;
      try {
        final data = await _api.pollPairingSession(_sessionId!);
        if (data['status'] == 'paired') {
          _pairingPollTimer?.cancel();
          _pairingCountdownTimer?.cancel();

          final dev = Map<String, dynamic>.from(data['device'] as Map);
          final st = Map<String, dynamic>.from(data['store'] as Map);
          final org = data['organization'] != null
              ? Map<String, dynamic>.from(data['organization'] as Map)
              : <String, dynamic>{};
          final token = data['access_token']?.toString() ?? '';

          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('pos_paired_device', jsonEncode(dev));
          await prefs.setString('pos_paired_store', jsonEncode(st));
          await prefs.setString('pos_paired_org', jsonEncode(org));
          await prefs.setString('pos_device_token', token);

          _api.deviceToken = token;
          _api.organizationId = org['id']?.toString();
          _api.storeId = st['id']?.toString();

          if (!mounted) return;
          setState(() {
            _device = dev;
            _store = st;
            _org = org;
            _isPaired = true;
          });

          _startPairedGuards();
          await _refreshTerminalData();
          _showSnack('Ghép nối thành công ${dev['name']}!');
        }
      } catch (_) {
        // Ignore transient polling error
      }
    });
  }

  void _startPairedGuards() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (!mounted || !_isPaired || _offlineMode || _isRevoked) return;
      _verifyDeviceStatus();
    });

    _graceTimer?.cancel();
    _graceTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || !_isPaired || !_offlineMode || _isRevoked || _isOfflineGraceExpired) {
        return;
      }
      if (_offlineGraceSeconds <= 1) {
        setState(() {
          _offlineGraceSeconds = 0;
          _isOfflineGraceExpired = true;
        });
      } else {
        setState(() => _offlineGraceSeconds--);
      }
    });
  }

  Future<void> _verifyDeviceStatus() async {
    final devId = _device?['id']?.toString();
    if (devId == null || devId.isEmpty) return;
    try {
      final data = await _api.checkDeviceStatus(devId);
      if (data['is_active'] == false) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('pos_paired_device');
        await prefs.remove('pos_device_token');
        if (!mounted) return;
        setState(() {
          _isRevoked = true;
          _revocationReason = data['message']?.toString() ??
              'Thiết bị này đã bị quản trị viên ngắt kết nối hoặc xóa.';
          _revocationTime = data['revoked_at']?.toString() ?? DateTime.now().toIso8601String();
        });
      }
    } catch (_) {
      // Network drop handled by offline grace guard
    }
  }

  Future<void> _refreshTerminalData() async {
    final storeId = _store?['id']?.toString();
    final orgId = _org?['id']?.toString() ?? '';
    if (!_isPaired || storeId == null || _offlineMode || _isRevoked) return;

    try {
      final results = await Future.wait([
        _api.fetchBootstrap(storeId),
        _api.fetchInventory(storeId).catchError((_) => <dynamic>[]),
        _api.fetchOrders(storeId).catchError((_) => <dynamic>[]),
      ]);

      final boot = results[0] as Map<String, dynamic>;
      final invList = results[1] as List<dynamic>;
      final ordList = results[2] as List<dynamic>;

      final invMap = <String, int>{};
      for (final row in invList) {
        if (row is Map) {
          final vid = row['product_variant_id']?.toString() ?? '';
          final qty = double.tryParse(
                (row['on_hand_quantity'] ?? row['quantity'] ?? 0).toString(),
              )?.floor() ??
              0;
          if (vid.isNotEmpty) invMap[vid] = qty;
        }
      }

      final prodMap = <String, Map<String, dynamic>>{};
      for (final p in (boot['products'] as List? ?? [])) {
        if (p is Map) {
          prodMap[p['id'].toString()] = Map<String, dynamic>.from(p);
        }
      }

      final barcodeMap = <String, String>{};
      for (final b in (boot['barcodes'] as List? ?? [])) {
        if (b is Map) {
          final vid = b['product_variant_id']?.toString() ?? '';
          if (!barcodeMap.containsKey(vid) || b['is_primary'] == true) {
            barcodeMap[vid] = b['barcode']?.toString() ?? '';
          }
        }
      }

      final mappedVariants = <Map<String, dynamic>>[];
      for (final v in (boot['variants'] as List? ?? [])) {
        if (v is! Map) continue;
        final prod = prodMap[v['product_id']?.toString()];
        if (v['status'] != 'active' || (prod != null && prod['status'] != 'active')) {
          continue;
        }
        final vid = v['id'].toString();
        mappedVariants.add({
          'variantId': vid,
          'productId': v['product_id']?.toString() ?? '',
          'productCode': prod?['product_code']?.toString() ?? v['variant_code']?.toString() ?? 'SKU',
          'productName': prod?['name']?.toString() ?? v['variant_name']?.toString() ?? 'Sản phẩm',
          'variantName': v['variant_name']?.toString() ?? 'Tiêu chuẩn',
          'sku': v['sku']?.toString() ?? v['variant_code']?.toString() ?? '',
          'barcode': barcodeMap[vid] ?? v['sku']?.toString() ?? '',
          'price': (double.tryParse(v['default_price']?.toString() ?? '0') ?? 0).round(),
          'onHand': invMap[vid] ?? 0,
        });
      }

      await LocalPosDb.instance.saveCatalogVariants(orgId, mappedVariants);

      final mappedOrders = ordList.take(50).map((o) {
        final m = Map<String, dynamic>.from(o as Map);
        return {
          'id': m['id'],
          'order_number': m['order_number'],
          'status': m['status'],
          'payment_status': m['payment_status'],
          'total_amount': (double.tryParse(m['total_amount']?.toString() ?? '0') ?? 0).round(),
          'occurred_at': m['occurred_at'] ?? m['created_at'],
        };
      }).toList();

      if (!mounted) return;
      setState(() {
        _variants = mappedVariants;
        _activeCashSession = boot['current_cash_session'] != null
            ? Map<String, dynamic>.from(boot['current_cash_session'] as Map)
            : null;
        if (mappedOrders.isNotEmpty) {
          _orders = mappedOrders;
        }
      });
    } catch (e) {
      debugPrint('Refresh error: $e');
    }
  }

  Future<void> _openCashSession() async {
    final storeId = _store?['id']?.toString();
    if (storeId == null) return;
    if (_offlineMode) {
      _showSnack('Cần kết nối mạng để mở ca thu ngân.', isError: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final session = await _api.openCashSession(storeId);
      if (!mounted) return;
      setState(() => _activeCashSession = session);
      _showSnack('Đã mở ca thu ngân (1.000.000₫ đầu ca)!');
    } catch (e) {
      _showSnack('Lỗi mở ca: $e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  int get _cartTotal =>
      _cart.fold(0, (sum, item) => sum + (item.price * item.quantity));

  void _addToCart(Map<String, dynamic> variant) {
    final vid = variant['variantId'].toString();
    setState(() {
      final idx = _cart.indexWhere((c) => c.variantId == vid);
      if (idx >= 0) {
        _cart[idx].quantity++;
      } else {
        _cart.add(
          CartEntry(
            variantId: vid,
            productName: variant['productName'].toString(),
            variantName: variant['variantName'].toString(),
            sku: variant['sku'].toString(),
            price: variant['price'] as int,
          ),
        );
      }
    });
  }

  Future<void> _checkoutOrder() async {
    if (_cart.isEmpty || _store == null) return;
    final storeId = _store!['id'].toString();
    final orgId = _org?['id']?.toString() ?? 'org';
    final devId = _device?['id']?.toString() ?? 'dev';

    Future<void> saveToOfflineOutbox([String? customNotice]) async {
      final outboxTotal = _outboxQueue.fold<int>(
        0,
        (sum, e) => sum + (int.tryParse(e['total_amount']?.toString() ?? '0') ?? 0),
      );
      if (_outboxQueue.length >= _maxOfflineOrders) {
        _showSnack(
          'Đạt giới hạn tối đa $_maxOfflineOrders đơn ngoại tuyến! Vui lòng đồng bộ trước.',
          isError: true,
        );
        return;
      }
      if (outboxTotal + _cartTotal > _maxOfflineAmount) {
        _showSnack(
          'Vượt hạn mức ngoại tuyến ${formatVnd(_maxOfflineAmount)}! Vui lòng kết nối mạng đồng bộ.',
          isError: true,
        );
        return;
      }

      final nowIso = DateTime.now().toUtc().toIso8601String();
      final ts = DateTime.now().millisecondsSinceEpoch;
      final clientOrderId = 'POS-APK-${ts.toString().substring(7)}';
      final eventId = 'ev_${_uuid.v4()}';
      final idemKey = '$orgId:pos:$clientOrderId';

      final items = _cart
          .map((c) => {
                'product_variant_id': c.variantId,
                'quantity': '${c.quantity}.0000',
                'unit_price': '${c.price}.0000',
              })
          .toList();

      await LocalPosDb.instance.enqueueOutboxOrder(
        eventId: eventId,
        idempotencyKey: idemKey,
        clientOrderId: clientOrderId,
        organizationId: orgId,
        storeId: storeId,
        deviceId: devId,
        occurredAt: nowIso,
        totalAmount: _cartTotal,
        paidAmount: _cartTotal,
        changeAmount: 0,
        items: items,
      );

      final refreshedVariants = await LocalPosDb.instance.loadCatalogVariants();
      final pendingOutbox = await LocalPosDb.instance.loadPendingOutboxEvents();

      if (!mounted) return;
      setState(() {
        _variants = refreshedVariants;
        _outboxQueue = pendingOutbox;
        _orders.insert(0, {
          'id': eventId,
          'order_number': clientOrderId,
          'status': 'offline_pending',
          'payment_status': 'paid',
          'total_amount': _cartTotal,
          'occurred_at': nowIso,
        });
        _cart.clear();
      });
      _showSnack(customNotice ?? 'Đã lưu đơn $clientOrderId vào hàng đợi ngoại tuyến!');
    }

    if (_offlineMode) {
      await saveToOfflineOutbox();
      return;
    }

    setState(() => _busy = true);
    try {
      final ts = DateTime.now().millisecondsSinceEpoch;
      final clientOrderId = 'POS-APK-$ts';
      final idemKey = '$orgId:pos:$clientOrderId';

      final order = await _api.createOrder(
        targetStoreId: storeId,
        clientOrderId: clientOrderId,
        idempotencyKey: idemKey,
        items: _cart
            .map((c) => {
                  'product_variant_id': c.variantId,
                  'quantity': '${c.quantity}.0000',
                })
            .toList(),
        paymentMethodCode: _paymentMethod,
        paidAmount: _cartTotal,
      );

      if (!mounted) return;
      setState(() {
        _cart.clear();
        _busy = false;
      });
      await _refreshTerminalData();
      _showSnack('Thanh toán thành công ${order['order_number']} — Đã trừ tồn kho!');
    } on PosApiException catch (e) {
      if (e.isNetworkError) {
        setState(() {
          _offlineMode = true;
          _busy = false;
        });
        await saveToOfflineOutbox('Mất mạng! Đã tự chuyển đơn vào hàng đợi ngoại tuyến.');
      } else {
        setState(() => _busy = false);
        _showSnack(e.message, isError: true);
      }
    } catch (e) {
      setState(() => _busy = false);
      _showSnack('Lỗi thanh toán: $e', isError: true);
    }
  }

  Future<void> _flushOutbox() async {
    if (_offlineMode) {
      _showSnack('Đang ở chế độ ngoại tuyến. Vui lòng bật mạng trước khi đồng bộ.', isError: true);
      return;
    }
    if (_outboxQueue.isEmpty || _store == null || _device == null) return;

    await _verifyDeviceStatus();
    if (_isRevoked) return;

    setState(() => _busy = true);
    try {
      final batchId = 'batch_${DateTime.now().millisecondsSinceEpoch}';
      final payloadEvents = _outboxQueue
          .map((ev) => {
                'event_id': ev['event_id'],
                'event_type': ev['event_type'],
                'idempotency_key': ev['idempotency_key'],
                'occurred_at': ev['occurred_at'],
                'payload': ev['payload'],
              })
          .toList();

      final res = await _api.pushOutboxBatch(
        deviceId: _device!['id'].toString(),
        targetStoreId: _store!['id'].toString(),
        batchId: batchId,
        events: payloadEvents,
      );

      final results = (res['results'] as List?) ?? [];
      final acceptedIds = results
          .where((r) => r is Map && (r['status'] == 'accepted' || r['status'] == 'duplicate'))
          .map((r) => r['event_id'].toString())
          .toList();

      await LocalPosDb.instance.markOutboxEventsAccepted(acceptedIds);
      final remaining = await LocalPosDb.instance.loadPendingOutboxEvents();

      if (!mounted) return;
      setState(() {
        _outboxQueue = remaining;
        _busy = false;
      });
      await _refreshTerminalData();
      _showSnack('Đã đồng bộ ${acceptedIds.length} đơn Offline lên máy chủ!');
    } catch (e) {
      if (mounted) setState(() => _busy = false);
      _showSnack('Lỗi đồng bộ Outbox: $e', isError: true);
    }
  }

  Future<void> _toggleOffline() async {
    final next = !_offlineMode;
    setState(() => _offlineMode = next);
    if (!next) {
      await _verifyDeviceStatus();
      if (!_isRevoked) {
        setState(() {
          _offlineGraceSeconds = _defaultGraceSeconds;
          _isOfflineGraceExpired = false;
        });
        await _refreshTerminalData();
      }
    }
  }

  Future<void> _resetAndRepair() async {
    _stopAllTimers();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('pos_paired_device');
    await prefs.remove('pos_paired_store');
    await prefs.remove('pos_paired_org');
    await prefs.remove('pos_device_token');
    await LocalPosDb.instance.clearAll();

    if (!mounted) return;
    setState(() {
      _isPaired = false;
      _isRevoked = false;
      _isOfflineGraceExpired = false;
      _offlineGraceSeconds = _defaultGraceSeconds;
      _offlineMode = false;
      _device = null;
      _store = null;
      _org = null;
      _api.deviceToken = null;
      _variants = [];
      _orders = [];
      _outboxQueue = [];
      _cart.clear();
      _activeCashSession = null;
    });
    await _requestPairingSession();
  }

  Future<void> _showServerConfigDialog() async {
    final ctrl = TextEditingController(text: _serverUrl);
    final updated = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cấu hình địa chỉ Backend API'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Nhập IP LAN máy chạy POS (VD: http://192.168.1.14:13000) hoặc http://10.0.2.2:13000 nếu chạy Android Emulator.',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                labelText: 'Địa chỉ máy chủ (URL)',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Lưu & Kết nối'),
          ),
        ],
      ),
    );
    if (updated != null && updated.isNotEmpty) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('pos_server_url', updated);
      setState(() {
        _serverUrl = updated;
        _api.baseUrl = updated;
      });
      if (!_isPaired) {
        await _requestPairingSession();
      } else {
        await _refreshTerminalData();
      }
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError ? Colors.red.shade700 : kEmeraldDark,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) {
      return const Scaffold(
        backgroundColor: kDarkKioskBg,
        body: Center(
          child: CircularProgressIndicator(color: kEmeraldPrimary),
        ),
      );
    }

    if (_isRevoked || _isOfflineGraceExpired) {
      return _buildLockoutScreen();
    }

    if (!_isPaired) {
      return _buildPairingScreen();
    }

    return _buildPosTerminalScreen();
  }

  Widget _buildLockoutScreen() {
    final isExpiredOnly = _isOfflineGraceExpired && !_isRevoked;
    return Scaffold(
      backgroundColor: kDarkKioskBg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 520),
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: const Color(0xFF1A0D11),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.red.shade700, width: 2),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.gpp_bad_rounded,
                    size: 64,
                    color: Colors.red.shade400,
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.red.shade400),
                    ),
                    child: Text(
                      isExpiredOnly
                          ? 'HẾT HẠN OFFLINE CHO PHÉP (2 GIỜ)'
                          : 'THIẾT BỊ ĐÃ BỊ THU HỒI / VÔ HIỆU HÓA',
                      style: TextStyle(
                        color: Colors.red.shade300,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    isExpiredOnly
                        ? 'Tạm Khóa Ngoại Tuyến'
                        : 'Máy POS Đã Bị Khóa An Ninh',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    isExpiredOnly
                        ? 'Máy POS đã offline quá 2 giờ liên tục mà chưa xác thực đám mây. Vui lòng kết nối Wi-Fi/4G để tiếp tục.'
                        : _revocationReason,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  const SizedBox(height: 20),
                  _auditRow('Mã máy:', _device?['device_code']?.toString() ?? 'POS-ANDROID'),
                  _auditRow('Chi nhánh:', _store?['name']?.toString() ?? '--'),
                  _auditRow('Thời điểm:', _revocationTime.isNotEmpty ? _revocationTime : 'Hiện tại'),
                  const SizedBox(height: 24),
                  if (isExpiredOnly) ...[
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.amber.shade600,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        onPressed: _toggleOffline,
                        icon: const Icon(Icons.wifi),
                        label: const Text('Kết nối lại mạng ngay'),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red.shade600,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: _resetAndRepair,
                      icon: const Icon(Icons.restart_alt),
                      label: const Text('Khởi động lại & Ghép nối máy mới'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _auditRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPairingScreen() {
    final digits = _pairingCode.padRight(6, '-').split('');
    final min = (_pairingSecondsLeft ~/ 60).toString().padLeft(2, '0');
    final sec = (_pairingSecondsLeft % 60).toString().padLeft(2, '0');

    return Scaffold(
      backgroundColor: kDarkKioskBg,
      appBar: AppBar(
        backgroundColor: kDarkPanelBg,
        foregroundColor: Colors.white,
        title: const Text(
          'Máy POS Android',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            onPressed: _showServerConfigDialog,
            icon: const Icon(Icons.settings_ethernet),
            tooltip: 'Cấu hình Server URL',
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 540),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: kDarkPanelBg,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white12),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.sensors, size: 48, color: kEmeraldPrimary),
                const SizedBox(height: 12),
                const Text(
                  'Kích Hoạt Máy POS Android',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Mở Web Quản Trị → Chi nhánh → Xem thiết bị → "+ Ghép Nối Máy POS Mới" và nhập mã 6 số dưới đây:',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                ),
                const SizedBox(height: 24),
                if (_busy)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(color: kEmeraldPrimary),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.center,
                    children: [
                      for (var i = 0; i < 6; i++)
                        Container(
                          width: 44,
                          height: 58,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: kEmeraldPrimary.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: kEmeraldPrimary, width: 1.5),
                          ),
                          child: Text(
                            digits[i],
                            style: const TextStyle(
                              color: Color(0xFF34D399),
                              fontSize: 26,
                              fontWeight: FontWeight.w900,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ),
                    ],
                  ),
                const SizedBox(height: 18),
                Text(
                  'Hiệu lực còn $min:$sec • Đang chờ phê duyệt...',
                  style: const TextStyle(color: Colors.white60, fontSize: 12),
                ),
                const SizedBox(height: 16),
                Text(
                  'Server: $_serverUrl',
                  style: const TextStyle(color: Colors.white38, fontSize: 11),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
                      onPressed: _requestPairingSession,
                      icon: const Icon(Icons.refresh, size: 18),
                      label: const Text('Làm mới mã'),
                    ),
                    const SizedBox(width: 12),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.white70),
                      onPressed: _showServerConfigDialog,
                      icon: const Icon(Icons.dns, size: 18),
                      label: const Text('Đổi IP Server'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPosTerminalScreen() {
    final isWide = MediaQuery.of(context).size.width >= 760;
    final filteredVariants = _variants.where((v) {
      if (_searchQuery.trim().isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      return v['productName'].toString().toLowerCase().contains(q) ||
          v['sku'].toString().toLowerCase().contains(q) ||
          v['barcode'].toString().toLowerCase().contains(q);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: kDarkPanelBg,
        foregroundColor: Colors.white,
        titleSpacing: 12,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _device?['name']?.toString() ?? 'Máy POS Android',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
            Text(
              '${_store?['name'] ?? ''} • ${_device?['device_code'] ?? ''}',
              style: const TextStyle(fontSize: 11, color: Color(0xFF34D399)),
            ),
          ],
        ),
        actions: [
          if (_outboxQueue.isNotEmpty)
            TextButton.icon(
              onPressed: _busy ? null : _flushOutbox,
              icon: const Icon(Icons.cloud_upload, color: Colors.amber, size: 18),
              label: Text(
                'Đồng bộ (${_outboxQueue.length})',
                style: const TextStyle(color: Colors.amber, fontWeight: FontWeight.bold),
              ),
            ),
          IconButton(
            onPressed: _toggleOffline,
            icon: Icon(
              _offlineMode ? Icons.wifi_off : Icons.wifi,
              color: _offlineMode ? Colors.amber : const Color(0xFF34D399),
            ),
            tooltip: _offlineMode ? 'Đang ngoại tuyến (Bấm để kết nối lại)' : 'Đang trực tuyến',
          ),
          TextButton(
            onPressed: _activeCashSession != null ? null : _openCashSession,
            child: Text(
              _activeCashSession != null ? 'Ca: Mở' : 'Mở ca',
              style: TextStyle(
                color: _activeCashSession != null ? const Color(0xFF34D399) : Colors.amber,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          PopupMenuButton<String>(
            onSelected: (val) {
              if (val == 'refresh') _refreshTerminalData();
              if (val == 'server') _showServerConfigDialog();
              if (val == 'reset') _resetAndRepair();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'refresh', child: Text('Tải lại thực đơn & tồn kho')),
              PopupMenuItem(value: 'server', child: Text('Đổi địa chỉ máy chủ')),
              PopupMenuItem(value: 'reset', child: Text('Hủy ghép nối máy POS')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (_offlineMode)
            Container(
              width: double.infinity,
              color: Colors.amber.shade100,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Row(
                children: [
                  const Icon(Icons.wifi_off, size: 16, color: Colors.deepOrange),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'CHẾ ĐỘ NGOẠI TUYẾN • Thời hạn còn ${_offlineGraceSeconds ~/ 60}p ${_offlineGraceSeconds % 60}s • Hàng đợi: ${_outboxQueue.length} đơn',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: isWide
                ? Row(
                    children: [
                      Expanded(flex: 3, child: _buildCatalogPane(filteredVariants)),
                      const VerticalDivider(width: 1),
                      Expanded(flex: 2, child: _buildCartPane()),
                    ],
                  )
                : IndexedStack(
                    index: _mobileTabIndex,
                    children: [
                      _buildCatalogPane(filteredVariants),
                      _buildCartPane(),
                      _buildOrdersPane(),
                    ],
                  ),
          ),
        ],
      ),
      bottomNavigationBar: isWide
          ? null
          : NavigationBar(
              selectedIndex: _mobileTabIndex,
              onDestinationSelected: (i) => setState(() => _mobileTabIndex = i),
              destinations: [
                const NavigationDestination(icon: Icon(Icons.grid_view), label: 'Thực đơn'),
                NavigationDestination(
                  icon: Badge(
                    isLabelVisible: _cart.isNotEmpty,
                    label: Text('${_cart.fold<int>(0, (s, e) => s + e.quantity)}'),
                    child: const Icon(Icons.shopping_cart),
                  ),
                  label: 'Giỏ hàng',
                ),
                const NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Hóa đơn'),
              ],
            ),
    );
  }

  Widget _buildCatalogPane(List<Map<String, dynamic>> items) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            decoration: InputDecoration(
              hintText: 'Tìm tên món, SKU hoặc mã vạch...',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
            ),
            onChanged: (val) => setState(() => _searchQuery = val),
          ),
        ),
        Expanded(
          child: items.isEmpty
              ? const Center(child: Text('Chưa có sản phẩm nào trong chi nhánh.'))
              : GridView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 210,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 1.05,
                  ),
                  itemCount: items.length,
                  itemBuilder: (ctx, i) {
                    final v = items[i];
                    return InkWell(
                      onTap: () => _addToCart(v),
                      borderRadius: BorderRadius.circular(14),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  v['productName'].toString(),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${v['variantName']} • ${v['sku']}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                              ],
                            ),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  formatVnd(v['price'] as int),
                                  style: const TextStyle(
                                    color: kEmeraldDark,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 14,
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: kMintSoft,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    'Kho: ${v['onHand']}',
                                    style: const TextStyle(
                                      fontSize: 10,
                                      color: kEmeraldDark,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildCartPane() {
    return Container(
      color: Colors.white,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Đơn hàng hiện tại',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                ),
                if (_cart.isNotEmpty)
                  TextButton(
                    onPressed: () => setState(() => _cart.clear()),
                    child: const Text('Xóa hết', style: TextStyle(color: Colors.red)),
                  ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: _cart.isEmpty
                ? const Center(
                    child: Text(
                      'Chạm vào món để thêm vào đơn',
                      style: TextStyle(color: Colors.black45),
                    ),
                  )
                : ListView.separated(
                    itemCount: _cart.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final item = _cart[i];
                      return ListTile(
                        dense: true,
                        title: Text(
                          item.productName,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Text(formatVnd(item.price)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.remove_circle_outline, size: 20),
                              onPressed: () {
                                setState(() {
                                  if (item.quantity > 1) {
                                    item.quantity--;
                                  } else {
                                    _cart.removeAt(i);
                                  }
                                });
                              },
                            ),
                            Text(
                              '${item.quantity}',
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                            IconButton(
                              icon: const Icon(Icons.add_circle_outline, size: 20),
                              onPressed: () => setState(() => item.quantity++),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              border: Border(top: BorderSide(color: Colors.grey.shade200)),
            ),
            child: Column(
              children: [
                DropdownButtonFormField<String>(
                  value: _paymentMethod,
                  decoration: const InputDecoration(
                    labelText: 'Phương thức thanh toán',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'CASH', child: Text('Tiền mặt')),
                    DropdownMenuItem(value: 'BANK_TRANSFER', child: Text('Chuyển khoản / QR')),
                    DropdownMenuItem(value: 'CARD', child: Text('Thẻ ngân hàng')),
                  ],
                  onChanged: (v) {
                    if (v != null) setState(() => _paymentMethod = v);
                  },
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Tổng thanh toán:', style: TextStyle(fontWeight: FontWeight.bold)),
                    Text(
                      formatVnd(_cartTotal),
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: kEmeraldDark,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: kEmeraldPrimary,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                    ),
                    onPressed: (_cart.isEmpty || _busy) ? null : _checkoutOrder,
                    child: _busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            _offlineMode
                                ? 'Lưu đơn ngoại tuyến (${formatVnd(_cartTotal)})'
                                : 'Thanh toán (${formatVnd(_cartTotal)})',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOrdersPane() {
    if (_orders.isEmpty) {
      return const Center(child: Text('Chưa có hóa đơn nào trong phiên.'));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: _orders.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final o = _orders[i];
        final isOffline = o['status'] == 'offline_pending';
        return Card(
          child: ListTile(
            leading: Icon(
              isOffline ? Icons.cloud_off : Icons.check_circle,
              color: isOffline ? Colors.amber.shade700 : kEmeraldPrimary,
            ),
            title: Text(
              o['order_number']?.toString() ?? '--',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            subtitle: Text(isOffline ? 'Chờ đồng bộ Outbox' : 'Đã đồng bộ máy chủ'),
            trailing: Text(
              formatVnd((o['total_amount'] as num?) ?? 0),
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        );
      },
    );
  }
}
