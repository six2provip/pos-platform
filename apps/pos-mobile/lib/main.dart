import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PosApkApp());
}

const Color kEmeraldPrimary = Color(0xFF059669);
const Color kEmeraldDark = Color(0xFF047857);
const Color kMintSoft = Color(0xFFE6F6F0);
const Color kCanvasBg = Color(0xFFF6F8FA);

class PosApkApp extends StatelessWidget {
  const PosApkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'POS Android LCD Terminal',
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
      home: const PosTerminalScreen(),
    );
  }
}

class PosProductItem {
  final String variantId;
  final String name;
  final String sku;
  final String category;
  final int price;
  final int stock;

  const PosProductItem({
    required this.variantId,
    required this.name,
    required this.sku,
    required this.category,
    required this.price,
    required this.stock,
  });
}

class PosTerminalScreen extends StatefulWidget {
  const PosTerminalScreen({super.key});

  @override
  State<PosTerminalScreen> createState() => _PosTerminalScreenState();
}

class _PosTerminalScreenState extends State<PosTerminalScreen> {
  final String apiBaseUrl = const String.fromEnvironment(
    'POS_API_BASE_URL',
    defaultValue: 'http://127.0.0.1:18000',
  );

  int currentTab = 1; // 0: Home, 1: POS, 2: Orders, 3: Customers, 4: Stock, 5: Stats
  String selectedCategory = 'All';
  String orderType = 'Dine In';
  String tableName = 'Table 21';
  bool offlineMode = false;
  String? recentlyAddedVariantId;

  final List<String> categories = const [
    'All',
    'Cà Phê',
    'Trà Đào',
    'Bánh Ngọt',
    'Matcha',
    'Combo',
  ];

  final List<PosProductItem> catalog = const [
    PosProductItem(
      variantId: 'v1',
      name: 'Cà Phê Sữa Đá Sài Gòn',
      sku: 'SKU-CF-SUADA',
      category: 'Cà Phê',
      price: 39000,
      stock: 120,
    ),
    PosProductItem(
      variantId: 'v2',
      name: 'Trà Đào Cam Sả Đặc Biệt',
      sku: 'SKU-TRADAO-L',
      category: 'Trà Đào',
      price: 45000,
      stock: 95,
    ),
    PosProductItem(
      variantId: 'v3',
      name: 'Bánh Sừng Bò Bơ Pháp',
      sku: 'SKU-CROISSANT',
      category: 'Bánh Ngọt',
      price: 35000,
      stock: 60,
    ),
    PosProductItem(
      variantId: 'v4',
      name: 'Bạc Xỉu Kem Muối Biển',
      sku: 'SKU-BACXIU-M',
      category: 'Cà Phê',
      price: 42000,
      stock: 85,
    ),
    PosProductItem(
      variantId: 'v5',
      name: 'Matcha Uji Kem Phô Mai',
      sku: 'SKU-MATCHA-UJI',
      category: 'Matcha',
      price: 49000,
      stock: 75,
    ),
    PosProductItem(
      variantId: 'v6',
      name: 'Trà Vải Hoa Hồng Lạnh',
      sku: 'SKU-TRAVAI-M',
      category: 'Trà Đào',
      price: 45000,
      stock: 90,
    ),
    PosProductItem(
      variantId: 'v7',
      name: 'Bánh Tiramisu Cà Phê Ý',
      sku: 'SKU-TIRAMISU',
      category: 'Bánh Ngọt',
      price: 48000,
      stock: 45,
    ),
    PosProductItem(
      variantId: 'v8',
      name: 'Combo Sáng: Cà Phê + Bánh',
      sku: 'SKU-COMBO-01',
      category: 'Combo',
      price: 65000,
      stock: 50,
    ),
  ];

  final Map<String, int> cartQty = {};
  final List<Map<String, dynamic>> offlineOutbox = [];

  List<PosProductItem> get filteredCatalog {
    if (selectedCategory == 'All') return catalog;
    return catalog.where((item) => item.category == selectedCategory).toList();
  }

  int get subtotal {
    int sum = 0;
    for (final item in catalog) {
      final q = cartQty[item.variantId] ?? 0;
      sum += item.price * q;
    }
    return sum;
  }

  int get taxAmount => (subtotal * 0.08).round();
  int get finalTotal => subtotal + taxAmount;
  int get totalItems => cartQty.values.fold(0, (a, b) => a + b);

  void addToCart(PosProductItem item) {
    setState(() {
      cartQty[item.variantId] = (cartQty[item.variantId] ?? 0) + 1;
      recentlyAddedVariantId = item.variantId;
    });
    Future.delayed(const Duration(milliseconds: 550), () {
      if (mounted && recentlyAddedVariantId == item.variantId) {
        setState(() {
          recentlyAddedVariantId = null;
        });
      }
    });
  }

  void updateQty(String variantId, int delta) {
    setState(() {
      final next = (cartQty[variantId] ?? 0) + delta;
      if (next <= 0) {
        cartQty.remove(variantId);
      } else {
        cartQty[variantId] = next;
      }
    });
  }

  Future<void> placeOrder() async {
    if (totalItems == 0) return;
    final orderId = 'POS-${DateTime.now().millisecondsSinceEpoch}';
    if (offlineMode) {
      setState(() {
        offlineOutbox.add({
          'client_order_id': orderId,
          'total_amount': finalTotal,
          'occurred_at': DateTime.now().toUtc().toIso8601String(),
        });
        cartQty.clear();
      });
      return;
    }

    try {
      await http.post(
        Uri.parse('$apiBaseUrl/api/v1/orders'),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'apk:$orderId',
        },
        body: jsonEncode({
          'client_order_id': orderId,
          'total_amount': finalTotal,
        }),
      );
    } catch (_) {
      offlineOutbox.add({
        'client_order_id': orderId,
        'total_amount': finalTotal,
      });
    }
    setState(() {
      cartQty.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final bool isLandscape = constraints.maxWidth >= 760;
            if (isLandscape) {
              return Row(
                children: [
                  _buildLeftRail(),
                  Expanded(
                    flex: 65,
                    child: _buildMainContent(crossAxisCount: 4),
                  ),
                  SizedBox(
                    width: 340,
                    child: _buildOrderDetailsPanel(),
                  ),
                ],
              );
            } else {
              return Column(
                children: [
                  Expanded(
                    child: _buildMainContent(crossAxisCount: 2),
                  ),
                  _buildPortraitBottomBar(context),
                ],
              );
            }
          },
        ),
      ),
    );
  }

  Widget _buildLeftRail() {
    return Container(
      width: 68,
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(right: BorderSide(color: Color(0xFFE5E7EB))),
      ),
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: kEmeraldPrimary,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.restaurant_menu, color: Colors.white, size: 20),
          ),
          Column(
            children: [
              _buildRailItem(0, Icons.home_rounded),
              _buildRailItem(1, Icons.grid_view_rounded),
              _buildRailItem(2, Icons.print_rounded),
              _buildRailItem(3, Icons.people_alt_rounded),
              _buildRailItem(4, Icons.inventory_2_rounded),
              _buildRailItem(5, Icons.pie_chart_rounded),
            ],
          ),
          const CircleAvatar(
            radius: 16,
            backgroundColor: kMintSoft,
            child: Text('TN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: kEmeraldPrimary)),
          ),
        ],
      ),
    );
  }

  Widget _buildRailItem(int index, IconData icon) {
    final bool active = currentTab == index;
    return GestureDetector(
      onTap: () => setState(() => currentTab = index),
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: active ? kMintSoft : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: active ? kEmeraldPrimary : Colors.grey, size: 20),
      ),
    );
  }

  Widget _buildMainContent({required int crossAxisCount}) {
    if (currentTab == 0) {
      // Home / Tables
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Sơ Đồ Bàn & Phòng', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Expanded(
              child: GridView.count(
                crossAxisCount: crossAxisCount,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                children: List.generate(12, (i) {
                  final tName = 'Table ${i + 1 < 10 ? "0${i + 1}" : i + 1}';
                  final bool occupied = i % 3 == 0;
                  return InkWell(
                    onTap: () {
                      setState(() {
                        tableName = tName;
                        currentTab = 1;
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: occupied ? Colors.amber.shade300 : const Color(0xFFE5E7EB)),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(tName, style: const TextStyle(fontWeight: FontWeight.bold)),
                              Text(occupied ? 'Đang ngồi' : 'Trống', style: TextStyle(fontSize: 10, color: occupied ? Colors.amber.shade900 : kEmeraldPrimary, fontWeight: FontWeight.bold)),
                            ],
                          ),
                          Icon(Icons.table_restaurant, color: occupied ? Colors.amber : Colors.grey.shade400, size: 32),
                          Text(occupied ? 'ORD-910$i' : '+ Gọi món', style: TextStyle(fontSize: 11, color: occupied ? Colors.black87 : kEmeraldPrimary, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  );
                }),
              ),
            ),
          ],
        ),
      );
    }

    if (currentTab == 2) {
      // Orders
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Lịch Sử Hóa Đơn Ca', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Expanded(
              child: ListView.builder(
                itemCount: 6,
                itemBuilder: (context, i) => Card(
                  elevation: 0,
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Color(0xFFE5E7EB))),
                  child: ListTile(
                    leading: const CircleAvatar(backgroundColor: kMintSoft, child: Icon(Icons.receipt, color: kEmeraldPrimary, size: 18)),
                    title: Text('ORD-910$i • Table 0${i + 1}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    subtitle: Text('${120000 + i * 35000} ₫ • Tiền mặt', style: const TextStyle(color: kEmeraldPrimary, fontWeight: FontWeight.bold)),
                    trailing: FilledButton.tonal(
                      onPressed: () {},
                      style: FilledButton.styleFrom(backgroundColor: kMintSoft, foregroundColor: kEmeraldPrimary),
                      child: const Text('In lại K80'),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    // Default: POS Catalog (Tab 1)
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Time to Order! • $tableName', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              FilterChip(
                selected: offlineMode,
                label: Text(offlineMode ? 'OFFLINE (${offlineOutbox.length})' : 'ONLINE'),
                onSelected: (_) => setState(() => offlineMode = !offlineMode),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 72,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: categories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final cat = categories[index];
                final isSelected = selectedCategory == cat;
                return GestureDetector(
                  onTap: () => setState(() => selectedCategory = cat),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    width: 80,
                    decoration: BoxDecoration(
                      color: isSelected ? kMintSoft : Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isSelected ? kEmeraldPrimary : const Color(0xFFE5E7EB),
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      cat,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: GridView.builder(
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: crossAxisCount,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 0.78,
              ),
              itemCount: filteredCatalog.length,
              itemBuilder: (context, index) {
                final item = filteredCatalog[index];
                final qty = cartQty[item.variantId] ?? 0;
                final justAdded = recentlyAddedVariantId == item.variantId;
                return AnimatedScale(
                  scale: justAdded ? 0.96 : 1.0,
                  duration: const Duration(milliseconds: 160),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Container(
                            width: double.infinity,
                            decoration: BoxDecoration(
                              color: const Color(0xFFFAFAFA),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              qty > 0 ? '×$qty' : item.category,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                color: kEmeraldPrimary,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          item.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('${item.stock} kho', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                            Text(
                              '${item.price} ₫',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                                color: kEmeraldPrimary,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.tonal(
                            style: FilledButton.styleFrom(
                              backgroundColor: justAdded ? kEmeraldPrimary : kMintSoft,
                              foregroundColor: justAdded ? Colors.white : kEmeraldPrimary,
                            ),
                            onPressed: () => addToCart(item),
                            child: Text(justAdded ? '✓ Added!' : '+ Add to cart'),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOrderDetailsPanel() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Order Details ($tableName)', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Expanded(
            child: ListView(
              children: catalog
                  .where((item) => (cartQty[item.variantId] ?? 0) > 0)
                  .map((item) {
                final q = cartQty[item.variantId]!;
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(item.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  subtitle: Text('${item.price * q} ₫', style: const TextStyle(color: kEmeraldPrimary, fontWeight: FontWeight.bold)),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(onPressed: () => updateQty(item.variantId, -1), icon: const Icon(Icons.remove, size: 16)),
                      Text('$q', style: const TextStyle(fontWeight: FontWeight.bold)),
                      IconButton(onPressed: () => updateQty(item.variantId, 1), icon: const Icon(Icons.add_circle, color: kEmeraldPrimary, size: 20)),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          const Divider(),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Total', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              Text('$finalTotal ₫', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: kEmeraldPrimary),
              onPressed: totalItems == 0 ? null : placeOrder,
              child: const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text('Place Order', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPortraitBottomBar(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Color(0xFFE5E7EB))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () {
                    showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => SizedBox(
                        height: MediaQuery.of(context).size.height * 0.8,
                        child: _buildOrderDetailsPanel(),
                      ),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: kMintSoft,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      'Order Details ($totalItems) • $finalTotal ₫',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: kEmeraldPrimary),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: kEmeraldPrimary),
                onPressed: totalItems == 0 ? null : placeOrder,
                child: const Text('Place Order'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              IconButton(icon: Icon(Icons.home, color: currentTab == 0 ? kEmeraldPrimary : Colors.grey), onPressed: () => setState(() => currentTab = 0)),
              IconButton(icon: Icon(Icons.grid_view, color: currentTab == 1 ? kEmeraldPrimary : Colors.grey), onPressed: () => setState(() => currentTab = 1)),
              IconButton(icon: Icon(Icons.print, color: currentTab == 2 ? kEmeraldPrimary : Colors.grey), onPressed: () => setState(() => currentTab = 2)),
            ],
          ),
        ],
      ),
    );
  }
}
