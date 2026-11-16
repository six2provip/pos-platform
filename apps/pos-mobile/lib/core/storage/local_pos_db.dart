import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';
import 'drift_schema.dart';

/// Local SQLite (Android/iOS) + SharedPreferences (Web Preview) storage manager.
class LocalPosDb {
  LocalPosDb._();
  static final LocalPosDb instance = LocalPosDb._();

  static const String _webCatalogKey = 'pos_web_catalog_variants';
  static const String _webOutboxKey = 'pos_web_outbox_events';

  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    final dbPath = await getDatabasesPath();
    final fullPath = p.join(dbPath, 'pos_mobile_offline.db');
    _db = await openDatabase(
      fullPath,
      version: 1,
      onCreate: (db, version) async {
        for (final stmt in kPosLocalSqliteSchemaStatements) {
          await db.execute(stmt);
        }
        await db.execute('''
          CREATE TABLE IF NOT EXISTS local_variant_stock (
            variant_id TEXT PRIMARY KEY,
            on_hand INTEGER NOT NULL DEFAULT 0,
            barcode TEXT,
            product_name TEXT NOT NULL,
            product_code TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        ''');
      },
    );
    return _db!;
  }

  Future<void> saveCatalogVariants(
    String organizationId,
    List<Map<String, dynamic>> items,
  ) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_webCatalogKey, jsonEncode(items));
      return;
    }

    final db = await database;
    final now = DateTime.now().toIso8601String();
    await db.transaction((txn) async {
      await txn.delete('local_product_variants');
      await txn.delete('local_variant_stock');
      for (final item in items) {
        await txn.insert(
          'local_product_variants',
          {
            'id': item['variantId'],
            'organization_id': organizationId,
            'product_id': item['productId'] ?? '',
            'variant_code': item['sku'] ?? '',
            'variant_name': item['variantName'] ?? 'Tiêu chuẩn',
            'sku': item['sku'] ?? '',
            'unit_name': 'Cái',
            'default_price': (item['price'] ?? 0).toString(),
            'currency_code': 'VND',
            'status': 'active',
            'version': 1,
            'updated_at': now,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
        await txn.insert(
          'local_variant_stock',
          {
            'variant_id': item['variantId'],
            'on_hand': item['onHand'] ?? 0,
            'barcode': item['barcode'] ?? '',
            'product_name': item['productName'] ?? 'Sản phẩm',
            'product_code': item['productCode'] ?? '',
            'updated_at': now,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    });
  }

  Future<List<Map<String, dynamic>>> loadCatalogVariants() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_webCatalogKey);
      if (raw == null || raw.isEmpty) return [];
      final decoded = jsonDecode(raw) as List<dynamic>;
      return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }

    final db = await database;
    final rows = await db.rawQuery('''
      SELECT v.id AS variantId, v.product_id AS productId, v.variant_name AS variantName,
             v.sku AS sku, v.default_price AS defaultPrice,
             s.on_hand AS onHand, s.barcode AS barcode,
             s.product_name AS productName, s.product_code AS productCode
      FROM local_product_variants v
      LEFT JOIN local_variant_stock s ON s.variant_id = v.id
    ''');
    return rows.map((r) {
      return {
        'variantId': r['variantId']?.toString() ?? '',
        'productId': r['productId']?.toString() ?? '',
        'productCode': r['productCode']?.toString() ?? '',
        'productName': r['productName']?.toString() ?? 'Sản phẩm',
        'variantName': r['variantName']?.toString() ?? 'Tiêu chuẩn',
        'sku': r['sku']?.toString() ?? '',
        'barcode': r['barcode']?.toString() ?? '',
        'price': (double.tryParse(r['defaultPrice']?.toString() ?? '0') ?? 0).round(),
        'onHand': int.tryParse(r['onHand']?.toString() ?? '0') ?? 0,
      };
    }).toList();
  }

  Future<void> enqueueOutboxOrder({
    required String eventId,
    required String idempotencyKey,
    required String clientOrderId,
    required String organizationId,
    required String storeId,
    required String deviceId,
    required String occurredAt,
    required int totalAmount,
    required int paidAmount,
    required int changeAmount,
    required List<Map<String, dynamic>> items,
  }) async {
    final payload = {
      'client_order_id': clientOrderId,
      'currency_code': 'VND',
      'total_amount': totalAmount,
      'items': items,
      'payments': [
        {
          'payment_method_code': 'CASH',
          'amount': '$totalAmount.0000',
        }
      ],
    };

    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      final outbox = await loadPendingOutboxEvents();
      outbox.add({
        'event_id': eventId,
        'event_type': 'order.created',
        'idempotency_key': idempotencyKey,
        'occurred_at': occurredAt,
        'total_amount': totalAmount,
        'payload': payload,
      });
      await prefs.setString(_webOutboxKey, jsonEncode(outbox));

      final catalog = await loadCatalogVariants();
      for (final item in items) {
        final vid = item['product_variant_id']?.toString() ?? '';
        final qty = (double.tryParse(item['quantity']?.toString() ?? '0') ?? 0).round();
        for (final v in catalog) {
          if (v['variantId'] == vid && qty > 0) {
            final curr = (v['onHand'] as int?) ?? 0;
            v['onHand'] = curr > qty ? curr - qty : 0;
          }
        }
      }
      await prefs.setString(_webCatalogKey, jsonEncode(catalog));
      return;
    }

    final db = await database;
    final countRows = await db.rawQuery('SELECT COUNT(*) AS cnt FROM local_outbox_events');
    final seq = (Sqflite.firstIntValue(countRows) ?? 0) + 1;

    await db.transaction((txn) async {
      await txn.insert(
        'local_outbox_events',
        {
          'event_id': eventId,
          'sequence_no': seq,
          'organization_id': organizationId,
          'store_id': storeId,
          'device_id': deviceId,
          'event_type': 'order.created',
          'entity_type': 'order',
          'entity_local_id': clientOrderId,
          'idempotency_key': idempotencyKey,
          'payload_json': jsonEncode(payload),
          'status': 'pending',
          'attempt_count': 0,
          'occurred_at': occurredAt,
          'created_at': DateTime.now().toIso8601String(),
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );

      await txn.insert(
        'local_orders',
        {
          'client_order_id': clientOrderId,
          'organization_id': organizationId,
          'store_id': storeId,
          'device_id': deviceId,
          'cashier_user_id': 'pos_cashier',
          'local_order_number': clientOrderId,
          'idempotency_key': idempotencyKey,
          'subtotal_amount': totalAmount.toString(),
          'discount_amount': '0',
          'tax_amount': '0',
          'total_amount': totalAmount.toString(),
          'paid_amount': paidAmount.toString(),
          'change_amount': changeAmount.toString(),
          'sync_status': 'pending',
          'occurred_at': occurredAt,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );

      for (final item in items) {
        final vid = item['product_variant_id']?.toString() ?? '';
        final qty = (double.tryParse(item['quantity']?.toString() ?? '0') ?? 0).round();
        if (vid.isNotEmpty && qty > 0) {
          await txn.rawUpdate(
            'UPDATE local_variant_stock SET on_hand = MAX(0, on_hand - ?) WHERE variant_id = ?',
            [qty, vid],
          );
        }
      }
    });
  }

  Future<List<Map<String, dynamic>>> loadPendingOutboxEvents() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_webOutboxKey);
      if (raw == null || raw.isEmpty) return [];
      final decoded = jsonDecode(raw) as List<dynamic>;
      return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }

    final db = await database;
    final rows = await db.query(
      'local_outbox_events',
      where: "status IN ('pending', 'retry_wait')",
      orderBy: 'sequence_no ASC',
    );
    return rows.map((r) {
      final payload = jsonDecode(r['payload_json'] as String) as Map<String, dynamic>;
      return {
        'event_id': r['event_id'],
        'event_type': r['event_type'],
        'idempotency_key': r['idempotency_key'],
        'occurred_at': r['occurred_at'],
        'total_amount': payload['total_amount'] ?? 0,
        'payload': payload,
      };
    }).toList();
  }

  Future<void> markOutboxEventsAccepted(List<String> eventIds) async {
    if (eventIds.isEmpty) return;
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      final outbox = await loadPendingOutboxEvents();
      final idSet = eventIds.toSet();
      final remaining = outbox.where((e) => !idSet.contains(e['event_id']?.toString())).toList();
      await prefs.setString(_webOutboxKey, jsonEncode(remaining));
      return;
    }

    final db = await database;
    final now = DateTime.now().toIso8601String();
    await db.transaction((txn) async {
      for (final id in eventIds) {
        await txn.update(
          'local_outbox_events',
          {'status': 'accepted', 'synced_at': now},
          where: 'event_id = ?',
          whereArgs: [id],
        );
      }
    });
  }

  Future<void> clearAll() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_webCatalogKey);
      await prefs.remove(_webOutboxKey);
      return;
    }

    final db = await database;
    await db.transaction((txn) async {
      await txn.delete('local_product_variants');
      await txn.delete('local_variant_stock');
      await txn.delete('local_outbox_events');
      await txn.delete('local_orders');
    });
  }
}
