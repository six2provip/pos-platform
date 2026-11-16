"""Idempotent catalog seed script for local development.

Populates rich Vietnamese F&B & Retail data for:
- Categories (parent + child hierarchy)
- Option Groups & Option Items (sizes, ice, sugar, toppings, creams, etc.)
- Products, Variants, Barcodes, PriceListItems, Inventory, and VariantOptionGroups

Usage inside Docker:
    docker exec pos-backend python /workspace/apps/backend/seed_catalog.py
"""

from __future__ import annotations

import os
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.core.database import build_engine, set_rls_tenant_context
from app.infrastructure.models import (
    CatalogChangeLog,
    Category,
    Inventory,
    OptionGroup,
    OptionItem,
    Organization,
    PriceList,
    PriceListItem,
    Product,
    ProductBarcode,
    ProductCategory,
    ProductVariant,
    Store,
    User,
    VariantOptionGroup,
)
from app.modules.products.router import (
    _serialize_category,
    _serialize_product,
    _serialize_variant,
)


CATEGORIES_DATA: List[Dict[str, Any]] = [
    {"code": "CAT-DRINKS", "name": "Đồ uống", "parent": None, "sort_order": 1},
    {"code": "CAT-COFFEE", "name": "Cà phê", "parent": "CAT-DRINKS", "sort_order": 10},
    {"code": "CAT-TEA", "name": "Trà & Trà trái cây", "parent": "CAT-DRINKS", "sort_order": 20},
    {"code": "CAT-MILKTEA", "name": "Trà sữa & Macchiato", "parent": "CAT-DRINKS", "sort_order": 30},
    {"code": "CAT-MATCHA", "name": "Matcha & Socola", "parent": "CAT-DRINKS", "sort_order": 40},
    {"code": "CAT-JUICE", "name": "Nước ép & Sinh tố", "parent": "CAT-DRINKS", "sort_order": 50},
    {"code": "CAT-FOOD", "name": "Bánh ngọt & Đồ ăn nhẹ", "parent": None, "sort_order": 2},
    {"code": "CAT-PASTRY", "name": "Bánh nướng & Croissant", "parent": "CAT-FOOD", "sort_order": 60},
    {"code": "CAT-CAKE", "name": "Bánh lạnh & Tiramisu", "parent": "CAT-FOOD", "sort_order": 70},
    {"code": "CAT-SNACK", "name": "Đồ ăn vặt & Khô", "parent": "CAT-FOOD", "sort_order": 80},
    {"code": "CAT-COMBO", "name": "Combo Tiết Kiệm", "parent": None, "sort_order": 3},
    {"code": "CAT-PACKAGED", "name": "Sản phẩm đóng gói (Mang về)", "parent": None, "sort_order": 4},
    {"code": "CAT-MERCH", "name": "Phụ kiện & Ly giữ nhiệt", "parent": None, "sort_order": 5},
]


OPTION_GROUPS_DATA: List[Dict[str, Any]] = [
    {
        "code": "OPT-SIZE",
        "name": "Kích cỡ ly (Size)",
        "description": "Chọn kích thước ly phù hợp",
        "selection_mode": "single",
        "is_required": True,
        "min_selections": 1,
        "max_selections": 1,
        "sort_order": 1,
        "items": [
            {"name": "Size S (Nhỏ - 350ml)", "price_delta": "0", "is_default": False},
            {"name": "Size M (Vừa - 500ml)", "price_delta": "6000", "is_default": True},
            {"name": "Size L (Lớn - 700ml)", "price_delta": "12000", "is_default": False},
        ],
    },
    {
        "code": "OPT-ICE",
        "name": "Mức đá",
        "description": "Tùy chỉnh lượng đá trong ly",
        "selection_mode": "single",
        "is_required": True,
        "min_selections": 1,
        "max_selections": 1,
        "sort_order": 2,
        "items": [
            {"name": "100% Đá (Bình thường)", "price_delta": "0", "is_default": True},
            {"name": "70% Đá (Ít đá)", "price_delta": "0", "is_default": False},
            {"name": "30% Đá (Rất ít đá)", "price_delta": "0", "is_default": False},
            {"name": "Không đá", "price_delta": "0", "is_default": False},
            {"name": "Đá để riêng", "price_delta": "0", "is_default": False},
        ],
    },
    {
        "code": "OPT-SUGAR",
        "name": "Mức đường",
        "description": "Tùy chỉnh độ ngọt theo khẩu vị",
        "selection_mode": "single",
        "is_required": True,
        "min_selections": 1,
        "max_selections": 1,
        "sort_order": 3,
        "items": [
            {"name": "100% Đường (Tiêu chuẩn)", "price_delta": "0", "is_default": True},
            {"name": "70% Đường (Ít ngọt)", "price_delta": "0", "is_default": False},
            {"name": "50% Đường (Ngọt vừa)", "price_delta": "0", "is_default": False},
            {"name": "30% Đường (Ít đường)", "price_delta": "0", "is_default": False},
            {"name": "0% Đường (Không đường)", "price_delta": "0", "is_default": False},
        ],
    },
    {
        "code": "OPT-TOPPING-TEA",
        "name": "Topping Trà & Trà sữa",
        "description": "Thêm topping giòn dai hấp dẫn (tối đa 4)",
        "selection_mode": "multiple",
        "is_required": False,
        "min_selections": 0,
        "max_selections": 4,
        "sort_order": 4,
        "items": [
            {"name": "Trân châu đen đường nâu", "price_delta": "8000", "is_default": False},
            {"name": "Trân châu trắng 3Q", "price_delta": "10000", "is_default": False},
            {"name": "Thạch đào giòn", "price_delta": "8000", "is_default": False},
            {"name": "Thạch nha đam", "price_delta": "7000", "is_default": False},
            {"name": "Pudding trứng mềm", "price_delta": "9000", "is_default": False},
            {"name": "Sương sáo thảo mộc", "price_delta": "7000", "is_default": False},
            {"name": "Hạt thủy tinh củ năng", "price_delta": "10000", "is_default": False},
        ],
    },
    {
        "code": "OPT-CREAM",
        "name": "Lớp kem phủ (Macchiato / Foam)",
        "description": "Thêm lớp kem béo mặn bên trên",
        "selection_mode": "single",
        "is_required": False,
        "min_selections": 0,
        "max_selections": 1,
        "sort_order": 5,
        "items": [
            {"name": "Kem phô mai mặn (Cheese Foam)", "price_delta": "12000", "is_default": False},
            {"name": "Kem muối biển", "price_delta": "10000", "is_default": False},
            {"name": "Kem trứng nướng", "price_delta": "15000", "is_default": False},
            {"name": "Whipping Cream", "price_delta": "8000", "is_default": False},
        ],
    },
    {
        "code": "OPT-COFFEE-SHOT",
        "name": "Tùy chỉnh Cà phê & Sữa",
        "description": "Thêm shot hoặc đổi loại sữa hạt",
        "selection_mode": "multiple",
        "is_required": False,
        "min_selections": 0,
        "max_selections": 2,
        "sort_order": 6,
        "items": [
            {"name": "Thêm 1 Shot Espresso", "price_delta": "12000", "is_default": False},
            {"name": "Thêm Sữa đặc", "price_delta": "5000", "is_default": False},
            {"name": "Đổi sang Sữa yến mạch (Oatmilk)", "price_delta": "15000", "is_default": False},
        ],
    },
    {
        "code": "OPT-CAKE-WARM",
        "name": "Cách phục vụ bánh",
        "description": "Chọn hâm nóng hoặc thêm sốt ăn kèm",
        "selection_mode": "single",
        "is_required": False,
        "min_selections": 0,
        "max_selections": 1,
        "sort_order": 7,
        "items": [
            {"name": "Hâm nóng giòn", "price_delta": "0", "is_default": True},
            {"name": "Để nguyên (Nhiệt độ phòng)", "price_delta": "0", "is_default": False},
            {"name": "Kèm sốt Socola Bỉ", "price_delta": "8000", "is_default": False},
            {"name": "Kèm mứt Dâu tây", "price_delta": "8000", "is_default": False},
        ],
    },
    {
        "code": "OPT-GRIND",
        "name": "Mức độ xay hạt (Cà phê gói)",
        "description": "Hỗ trợ xay miễn phí theo dụng cụ pha",
        "selection_mode": "single",
        "is_required": True,
        "min_selections": 1,
        "max_selections": 1,
        "sort_order": 8,
        "items": [
            {"name": "Nguyên hạt", "price_delta": "0", "is_default": True},
            {"name": "Xay pha Phin truyền thống", "price_delta": "0", "is_default": False},
            {"name": "Xay pha Máy Espresso", "price_delta": "0", "is_default": False},
            {"name": "Xay pha Cold Brew", "price_delta": "0", "is_default": False},
        ],
    },
    {
        "code": "OPT-PACKAGING",
        "name": "Đóng gói & Dụng cụ",
        "description": "Tùy chọn đóng gói mang về hoặc tặng quà",
        "selection_mode": "multiple",
        "is_required": False,
        "min_selections": 0,
        "max_selections": 3,
        "sort_order": 9,
        "items": [
            {"name": "Túi giữ nhiệt bạc", "price_delta": "5000", "is_default": False},
            {"name": "Bộ dao nĩa / muỗng gỗ thân thiện", "price_delta": "2000", "is_default": False},
            {"name": "Hộp quà tặng & Thiệp viết tay", "price_delta": "15000", "is_default": False},
        ],
    },
    {
        "code": "OPT-SPICE",
        "name": "Mức độ cay (Đồ ăn vặt)",
        "description": "Chọn độ cay phù hợp",
        "selection_mode": "single",
        "is_required": False,
        "min_selections": 0,
        "max_selections": 1,
        "sort_order": 10,
        "items": [
            {"name": "Không cay", "price_delta": "0", "is_default": True},
            {"name": "Cay vừa", "price_delta": "0", "is_default": False},
            {"name": "Siêu cay", "price_delta": "0", "is_default": False},
        ],
    },
]


# Mapping for existing products to categories & option groups
EXISTING_PRODUCT_MAPPINGS: Dict[str, Tuple[str, List[str]]] = {
    "CF-SUA-DA": ("CAT-COFFEE", ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-COFFEE-SHOT"]),
    "BAC-XIU-KEM": ("CAT-COFFEE", ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-CREAM"]),
    "TRA-DAO-CAM-SA": ("CAT-TEA", ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA"]),
    "TRA-VAI-HOA-HONG": ("CAT-TEA", ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA"]),
    "MATCHA-UJI-KEM": ("CAT-MATCHA", ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-CREAM", "OPT-TOPPING-TEA"]),
    "CROISSANT-BO": ("CAT-PASTRY", ["OPT-CAKE-WARM", "OPT-PACKAGING"]),
    "BANH-TIRAMISU-CA-PHE": ("CAT-CAKE", ["OPT-PACKAGING"]),
    "COMBO-SANG-TINH-TE": ("CAT-COMBO", ["OPT-ICE", "OPT-SUGAR", "OPT-CAKE-WARM"]),
}


NEW_PRODUCTS_DATA: List[Dict[str, Any]] = [
    # --- CÀ PHÊ ---
    {
        "code": "CF-DEN-DA",
        "name": "Cà Phê Đen Đá Sài Gòn",
        "category": "CAT-COFFEE",
        "description": "Cà phê Robusta rang đậm pha phin truyền thống, hương vị mạnh mẽ.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-COFFEE-SHOT"],
        "variants": [
            {"code": "CF-DEN-DA-LY", "name": "Ly Tiêu Chuẩn", "unit": "ly", "cost": "10000", "price": "29000", "stock": 180},
            {"code": "CF-DEN-DA-CHAI", "name": "Chai Mang Về 330ml", "unit": "chai", "cost": "18000", "price": "45000", "stock": 65},
        ],
    },
    {
        "code": "CF-AMERICANO",
        "name": "Americano Đá / Nóng",
        "category": "CAT-COFFEE",
        "description": "Espresso chiết xuất từ hạt Arabica Cầu Đất kết hợp nước tinh khiết.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-COFFEE-SHOT"],
        "variants": [
            {"code": "CF-AMERICANO-DA", "name": "Bản Đá", "unit": "ly", "cost": "12000", "price": "39000", "stock": 140},
            {"code": "CF-AMERICANO-NONG", "name": "Bản Nóng", "unit": "ly", "cost": "12000", "price": "39000", "stock": 140},
        ],
    },
    {
        "code": "CF-LATTE",
        "name": "Cà Phê Latte Nghệ Thuật",
        "category": "CAT-COFFEE",
        "description": "Espresso hòa quyện sữa tươi thanh trùng béo mịn.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-COFFEE-SHOT"],
        "variants": [
            {"code": "CF-LATTE-CLASSIC", "name": "Latte Cổ Điển", "unit": "ly", "cost": "16000", "price": "49000", "stock": 120},
            {"code": "CF-LATTE-ALMOND", "name": "Latte Sữa Hạnh Nhân", "unit": "ly", "cost": "22000", "price": "59000", "stock": 80},
        ],
    },
    {
        "code": "CF-CARAMEL-MAC",
        "name": "Caramel Macchiato",
        "category": "CAT-COFFEE",
        "description": "Sữa tươi đánh bọt kết hợp Espresso và sốt Caramel thơm lừng.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-CREAM"],
        "variants": [
            {"code": "CF-CARAMEL-MAC-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "18000", "price": "55000", "stock": 110},
        ],
    },
    {
        "code": "CF-COLD-BREW",
        "name": "Cold Brew Cam Vàng",
        "category": "CAT-COFFEE",
        "description": "Cà phê ủ lạnh 18 giờ kết hợp lát cam vàng tươi thanh mát.",
        "options": ["OPT-ICE", "OPT-SUGAR"],
        "variants": [
            {"code": "CF-COLD-BREW-300", "name": "Chai 300ml", "unit": "chai", "cost": "20000", "price": "59000", "stock": 45},
        ],
    },
    # --- TRÀ & TRÀ TRÁI CÂY ---
    {
        "code": "TRA-SEN-VANG",
        "name": "Trà Sen Vàng Kem Phô Mai",
        "category": "CAT-TEA",
        "description": "Trà Oolong ủ hương sen thanh khiết cùng hạt sen bùi bùi và kem phô mai.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA", "OPT-CREAM"],
        "variants": [
            {"code": "TRA-SEN-VANG-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "17000", "price": "52000", "stock": 150},
        ],
    },
    {
        "code": "TRA-OI-HONG",
        "name": "Trà Ổi Hồng Thanh Mát",
        "category": "CAT-TEA",
        "description": "Trà xanh nhài kết hợp nước ép ổi hồng tươi và xí muội.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA"],
        "variants": [
            {"code": "TRA-OI-HONG-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "15000", "price": "45000", "stock": 130},
        ],
    },
    {
        "code": "TRA-CHANH-DAY",
        "name": "Trà Chanh Dây Hạt Chia",
        "category": "CAT-TEA",
        "description": "Chanh dây tươi chua ngọt tự nhiên kết hợp hạt chia giàu dinh dưỡng.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA"],
        "variants": [
            {"code": "TRA-CHANH-DAY-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "14000", "price": "42000", "stock": 160},
        ],
    },
    {
        "code": "TRA-OOLONG-BUOI",
        "name": "Trà Oolong Bưởi Mật Ong",
        "category": "CAT-TEA",
        "description": "Trà Oolong cao sơn hòa quyện mứt bưởi hồng và mật ong rừng.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA"],
        "variants": [
            {"code": "TRA-OOLONG-BUOI-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "17000", "price": "49000", "stock": 95},
        ],
    },
    # --- TRÀ SỮA & MACCHIATO ---
    {
        "code": "TS-TRUYEN-THONG",
        "name": "Trà Sữa Truyền Thống Trân Châu Đen",
        "category": "CAT-MILKTEA",
        "description": "Hồng trà đậm vị pha cùng sữa béo và trân châu đường nâu dẻo mềm.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA", "OPT-CREAM"],
        "variants": [
            {"code": "TS-TRUYEN-THONG-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "15000", "price": "45000", "stock": 200},
        ],
    },
    {
        "code": "TS-OOLONG-NUONG",
        "name": "Trà Sữa Oolong Rang Kem Trứng",
        "category": "CAT-MILKTEA",
        "description": "Trà Oolong rang khói thơm lừng phủ kem trứng nướng béo ngậy.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA", "OPT-CREAM"],
        "variants": [
            {"code": "TS-OOLONG-NUONG-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "19000", "price": "55000", "stock": 120},
        ],
    },
    {
        "code": "TS-SUA-TUOI-TC",
        "name": "Sữa Tươi Trân Châu Đường Đen",
        "category": "CAT-MILKTEA",
        "description": "Sữa tươi thanh trùng kết hợp trân châu nấu đường đen Okinawa.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-TOPPING-TEA", "OPT-CREAM"],
        "variants": [
            {"code": "TS-SUA-TUOI-TC-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "18000", "price": "52000", "stock": 140},
        ],
    },
    {
        "code": "TS-THAI-XANH",
        "name": "Trà Sữa Thái Xanh Mát Lạnh",
        "category": "CAT-MILKTEA",
        "description": "Trà Thái xanh thơm hương thảo mộc, ngọt dịu giải nhiệt.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA"],
        "variants": [
            {"code": "TS-THAI-XANH-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "13000", "price": "39000", "stock": 175},
        ],
    },
    # --- MATCHA & SOCOLA ---
    {
        "code": "SOCOLA-DA-XAY",
        "name": "Socola Bỉ Đá Xay",
        "category": "CAT-MATCHA",
        "description": "Socola Bỉ nguyên chất xay cùng đá và sữa tươi, phủ Whipping Cream.",
        "options": ["OPT-SIZE", "OPT-SUGAR", "OPT-CREAM"],
        "variants": [
            {"code": "SOCOLA-DA-XAY-STD", "name": "Tiêu chuẩn", "unit": "ly", "cost": "21000", "price": "59000", "stock": 90},
        ],
    },
    {
        "code": "MATCHA-LATTE",
        "name": "Matcha Latte Nhật Bản",
        "category": "CAT-MATCHA",
        "description": "Bột trà xanh Matcha Uji nguyên chất đánh bông cùng sữa tươi.",
        "options": ["OPT-SIZE", "OPT-ICE", "OPT-SUGAR", "OPT-CREAM"],
        "variants": [
            {"code": "MATCHA-LATTE-DA", "name": "Bản Đá", "unit": "ly", "cost": "20000", "price": "55000", "stock": 115},
            {"code": "MATCHA-LATTE-NONG", "name": "Bản Nóng", "unit": "ly", "cost": "20000", "price": "55000", "stock": 115},
        ],
    },
    # --- NƯỚC ÉP & SINH TỐ ---
    {
        "code": "EP-CAM-TUOI",
        "name": "Nước Ép Cam Tươi Nguyên Chất",
        "category": "CAT-JUICE",
        "description": "100% cam sành tươi ép lạnh mỗi ngày, không chất bảo quản.",
        "options": ["OPT-ICE", "OPT-SUGAR"],
        "variants": [
            {"code": "EP-CAM-330", "name": "Ly / Chai 330ml", "unit": "ly", "cost": "18000", "price": "45000", "stock": 85},
        ],
    },
    {
        "code": "SINH-TO-BO",
        "name": "Sinh Tố Bơ Sáp Đắk Lắk",
        "category": "CAT-JUICE",
        "description": "Bơ sáp dẻo béo xay mịn cùng sữa đặc và nước cốt dừa.",
        "options": ["OPT-SUGAR", "OPT-CREAM"],
        "variants": [
            {"code": "SINH-TO-BO-500", "name": "Ly 500ml", "unit": "ly", "cost": "22000", "price": "55000", "stock": 60},
        ],
    },
    # --- BÁNH NƯỚNG & CROISSANT ---
    {
        "code": "BANH-PAIN-CHOC",
        "name": "Bánh Pain au Chocolat",
        "category": "CAT-PASTRY",
        "description": "Bánh ngàn lớp nhân socola Bỉ nướng giòn tan mỗi sáng.",
        "options": ["OPT-CAKE-WARM", "OPT-PACKAGING"],
        "variants": [
            {"code": "BANH-PAIN-CHOC-CAI", "name": "1 Cái", "unit": "cái", "cost": "18000", "price": "42000", "stock": 50},
        ],
    },
    {
        "code": "BANH-MI-CHABONG",
        "name": "Bánh Mì Bơ Tỏi Phô Mai Chà Bông",
        "category": "CAT-PASTRY",
        "description": "Bánh mì mềm thơm sốt bơ tỏi, phủ phô mai tan chảy và chà bông.",
        "options": ["OPT-CAKE-WARM", "OPT-PACKAGING"],
        "variants": [
            {"code": "BANH-MI-CHABONG-O", "name": "1 Ổ", "unit": "ổ", "cost": "19000", "price": "45000", "stock": 40},
        ],
    },
    {
        "code": "BANH-DONUT-GLAZE",
        "name": "Bánh Donut Phủ Socola & Dâu",
        "category": "CAT-PASTRY",
        "description": "Bánh Donut chiên mềm nhẹ phủ lớp sốt ngọt dịu.",
        "options": ["OPT-PACKAGING"],
        "variants": [
            {"code": "BANH-DONUT-CHOC", "name": "Vị Socola (1 cái)", "unit": "cái", "cost": "12000", "price": "28000", "stock": 70},
            {"code": "BANH-DONUT-DAU", "name": "Vị Dâu Tây (1 cái)", "unit": "cái", "cost": "12000", "price": "28000", "stock": 70},
            {"code": "BANH-DONUT-BOX3", "name": "Hộp 3 cái Mix vị", "unit": "hộp", "cost": "33000", "price": "75000", "stock": 35},
        ],
    },
    # --- BÁNH LẠNH & TIRAMISU ---
    {
        "code": "BANH-MOUSSE-CHOC",
        "name": "Bánh Mousse Socola Đắng 70%",
        "category": "CAT-CAKE",
        "description": "Mousse socola mịn mượt đậm đà vị cacao nguyên chất.",
        "options": ["OPT-PACKAGING"],
        "variants": [
            {"code": "BANH-MOUSSE-CHOC-SLICE", "name": "1 Miếng", "unit": "miếng", "cost": "24000", "price": "55000", "stock": 30},
        ],
    },
    {
        "code": "BANH-CHEESE-CHANH",
        "name": "Cheesecake Chanh Dây",
        "category": "CAT-CAKE",
        "description": "Bánh phô mai lạnh béo nhẹ hòa quyện lớp sốt chanh dây chua thanh.",
        "options": ["OPT-PACKAGING"],
        "variants": [
            {"code": "BANH-CHEESE-CHANH-SLICE", "name": "1 Miếng", "unit": "miếng", "cost": "25000", "price": "58000", "stock": 35},
        ],
    },
    {
        "code": "BANH-RED-VELVET",
        "name": "Bánh Red Velvet Kem Phô Mai",
        "category": "CAT-CAKE",
        "description": "Cốt bánh nhung đỏ mềm ẩm xen kẽ lớp kem cream cheese dịu nhẹ.",
        "options": ["OPT-PACKAGING"],
        "variants": [
            {"code": "BANH-RED-VELVET-SLICE", "name": "1 Miếng", "unit": "miếng", "cost": "26000", "price": "59000", "stock": 28},
        ],
    },
    # --- ĐỒ ĂN VẶT & KHÔ ---
    {
        "code": "SNACK-KHO-GA",
        "name": "Khô Gà Lá Chanh Giòn Ngon",
        "category": "CAT-SNACK",
        "description": "Ức gà xé sợi sấy giòn cùng lá chanh tươi và ớt hiểm.",
        "options": ["OPT-SPICE", "OPT-PACKAGING"],
        "variants": [
            {"code": "SNACK-KHO-GA-100G", "name": "Hũ 100g", "unit": "hũ", "cost": "20000", "price": "45000", "stock": 90},
            {"code": "SNACK-KHO-GA-250G", "name": "Hũ 250g", "unit": "hũ", "cost": "45000", "price": "99000", "stock": 55},
        ],
    },
    {
        "code": "SNACK-HAT-DIEU",
        "name": "Hạt Điều Rang Muối Bình Phước",
        "category": "CAT-SNACK",
        "description": "Hạt điều loại A rang củi giữ nguyên vị bùi giòn tự nhiên.",
        "options": ["OPT-PACKAGING"],
        "variants": [
            {"code": "SNACK-HAT-DIEU-150G", "name": "Hũ 150g", "unit": "hũ", "cost": "35000", "price": "75000", "stock": 60},
            {"code": "SNACK-HAT-DIEU-300G", "name": "Hũ 300g", "unit": "hũ", "cost": "65000", "price": "139000", "stock": 40},
        ],
    },
    # --- COMBO TIẾT KIỆM ---
    {
        "code": "COMBO-CHILL-CHIEU",
        "name": "Combo Trà Chiều (Trà Đào + Cheesecake)",
        "category": "CAT-COMBO",
        "description": "Tiết kiệm 15.000đ khi mua 01 Trà Đào Cam Sả kèm 01 Cheesecake Chanh Dây.",
        "options": ["OPT-ICE", "OPT-SUGAR", "OPT-PACKAGING"],
        "variants": [
            {"code": "COMBO-CHILL-STD", "name": "Combo Tiêu chuẩn", "unit": "combo", "cost": "40000", "price": "89000", "stock": 50},
        ],
    },
    {
        "code": "COMBO-NHOM-4",
        "name": "Combo Nhóm Bạn (4 Ly Trà Sữa + 2 Bánh)",
        "category": "CAT-COMBO",
        "description": "Combo dành cho nhóm 4 người với 4 ly Trà Sữa Size M và 2 bánh tự chọn.",
        "options": ["OPT-ICE", "OPT-SUGAR", "OPT-TOPPING-TEA", "OPT-PACKAGING"],
        "variants": [
            {"code": "COMBO-NHOM-4-STD", "name": "Combo 4 Người", "unit": "combo", "cost": "105000", "price": "229000", "stock": 30},
        ],
    },
    # --- SẢN PHẨM ĐÓNG GÓI ---
    {
        "code": "PKG-CF-ARABICA",
        "name": "Cà Phê Hạt Arabica Cầu Đất",
        "category": "CAT-PACKAGED",
        "description": "100% Arabica Cầu Đất độ cao 1.500m, rang vừa (Medium Roast), hương hoa quả.",
        "options": ["OPT-GRIND", "OPT-PACKAGING"],
        "variants": [
            {"code": "PKG-CF-ARABICA-250G", "name": "Gói 250g", "unit": "gói", "cost": "95000", "price": "185000", "stock": 75},
            {"code": "PKG-CF-ARABICA-500G", "name": "Gói 500g", "unit": "gói", "cost": "180000", "price": "349000", "stock": 45},
        ],
    },
    {
        "code": "PKG-TRA-OOLONG",
        "name": "Trà Oolong Bảo Lộc Thượng Hạng",
        "category": "CAT-PACKAGED",
        "description": "Lá trà Oolong tuyển chọn đóng hộp thiếc sang trọng, thích hợp làm quà tặng.",
        "options": ["OPT-PACKAGING"],
        "variants": [
            {"code": "PKG-TRA-OOLONG-150G", "name": "Hộp thiếc 150g", "unit": "hộp", "cost": "110000", "price": "215000", "stock": 50},
        ],
    },
    # --- PHỤ KIỆN ---
    {
        "code": "MERCH-LY-GIU-NHIET",
        "name": "Ly Giữ Nhiệt Inox 304 (500ml)",
        "category": "CAT-MERCH",
        "description": "Ly giữ nhiệt 2 lớp chân không giữ lạnh đến 12 giờ, tặng kèm ống hút inox.",
        "options": ["OPT-PACKAGING"],
        "variants": [
            {"code": "MERCH-LY-DEN", "name": "Màu Đen Nhám", "unit": "cái", "cost": "110000", "price": "249000", "stock": 40},
            {"code": "MERCH-LY-TRANG", "name": "Màu Trắng Sứ", "unit": "cái", "cost": "110000", "price": "249000", "stock": 35},
        ],
    },
    {
        "code": "MERCH-TUI-TOTE",
        "name": "Túi Vải Canvas Demo Chain",
        "category": "CAT-MERCH",
        "description": "Túi vải canvas dày dặn, đựng vừa laptop 14 inch và bình nước.",
        "options": ["OPT-PACKAGING"],
        "variants": [
            {"code": "MERCH-TUI-TOTE-STD", "name": "Phiên bản Tiêu chuẩn", "unit": "cái", "cost": "45000", "price": "119000", "stock": 80},
        ],
    },
]


def _ean13_from_seed(idx: int) -> str:
    """Generate a deterministic 13-digit EAN-13 barcode with valid check digit."""
    base = f"893500{idx:06d}"
    digits = [int(c) for c in base]
    odd_sum = sum(digits[0::2])
    even_sum = sum(digits[1::2])
    check = (10 - ((odd_sum + even_sum * 3) % 10)) % 10
    return f"{base}{check}"


def seed() -> None:
    settings = Settings.from_env()
    engine = build_engine(settings.database_url)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)

    with SessionLocal() as db:
        org = db.query(Organization).filter(Organization.code == "DEMO").first()
        if org is None:
            raise RuntimeError("Organization 'DEMO' not found. Start backend with AUTO_SEED_DEMO=true first.")

        set_rls_tenant_context(db, org.id)

        store = db.query(Store).filter(Store.organization_id == org.id).first()
        if store is None:
            raise RuntimeError("No store found for organization DEMO.")

        price_list = (
            db.query(PriceList)
            .filter(PriceList.organization_id == org.id, PriceList.is_default.is_(True))
            .first()
        )
        admin_user = db.query(User).filter(User.email == "admin@demo.vn").first()
        actor_id = admin_user.id if admin_user else None

        # 1. Seed Categories
        cat_by_code: Dict[str, Category] = {}
        created_cats = 0
        for c_data in CATEGORIES_DATA:
            existing_cat = (
                db.query(Category)
                .filter(Category.organization_id == org.id, Category.code == c_data["code"])
                .first()
            )
            if existing_cat:
                cat_by_code[c_data["code"]] = existing_cat
                continue

            parent_id = cat_by_code[c_data["parent"]].id if c_data["parent"] else None
            cat = Category(
                organization_id=org.id,
                parent_category_id=parent_id,
                code=c_data["code"],
                name=c_data["name"],
                sort_order=c_data["sort_order"],
                status="active",
            )
            db.add(cat)
            db.flush()
            db.add(
                CatalogChangeLog(
                    organization_id=org.id,
                    stream_name="catalog",
                    entity_type="category",
                    change_type="upsert",
                    entity_id=cat.id,
                    version=1,
                    payload=_serialize_category(cat),
                )
            )
            cat_by_code[c_data["code"]] = cat
            created_cats += 1

        # 2. Seed Option Groups & Option Items
        opt_by_code: Dict[str, OptionGroup] = {}
        created_opt_groups = 0
        created_opt_items = 0
        for g_data in OPTION_GROUPS_DATA:
            existing_grp = (
                db.query(OptionGroup)
                .filter(OptionGroup.organization_id == org.id, OptionGroup.code == g_data["code"])
                .first()
            )
            if existing_grp:
                opt_by_code[g_data["code"]] = existing_grp
                continue

            grp = OptionGroup(
                organization_id=org.id,
                code=g_data["code"],
                name=g_data["name"],
                description=g_data["description"],
                selection_mode=g_data["selection_mode"],
                is_required=g_data["is_required"],
                min_selections=g_data["min_selections"],
                max_selections=g_data["max_selections"],
                sort_order=g_data["sort_order"],
                status="active",
                version=1,
            )
            db.add(grp)
            db.flush()

            for idx, item_data in enumerate(g_data["items"], start=1):
                item = OptionItem(
                    organization_id=org.id,
                    option_group_id=grp.id,
                    name=item_data["name"],
                    price_delta=Decimal(item_data["price_delta"]),
                    is_default=item_data["is_default"],
                    sort_order=idx,
                    status="active",
                )
                db.add(item)
                created_opt_items += 1

            opt_by_code[g_data["code"]] = grp
            created_opt_groups += 1

        db.flush()

        # Helper to link variant to option groups, price list, inventory
        def ensure_variant_links(
            variant: ProductVariant,
            option_codes: List[str],
            stock_qty: int,
        ) -> None:
            for sort_idx, opt_code in enumerate(option_codes, start=1):
                grp = opt_by_code.get(opt_code)
                if not grp:
                    continue
                exists_link = (
                    db.query(VariantOptionGroup)
                    .filter(
                        VariantOptionGroup.organization_id == org.id,
                        VariantOptionGroup.product_variant_id == variant.id,
                        VariantOptionGroup.option_group_id == grp.id,
                    )
                    .first()
                )
                if not exists_link:
                    db.add(
                        VariantOptionGroup(
                            organization_id=org.id,
                            product_variant_id=variant.id,
                            option_group_id=grp.id,
                            sort_order=sort_idx,
                        )
                    )

            if price_list:
                exists_pli = (
                    db.query(PriceListItem)
                    .filter(
                        PriceListItem.organization_id == org.id,
                        PriceListItem.price_list_id == price_list.id,
                        PriceListItem.product_variant_id == variant.id,
                    )
                    .first()
                )
                if not exists_pli:
                    db.add(
                        PriceListItem(
                            organization_id=org.id,
                            price_list_id=price_list.id,
                            product_variant_id=variant.id,
                            unit_price=variant.default_price,
                        )
                    )

            exists_inv = (
                db.query(Inventory)
                .filter(
                    Inventory.organization_id == org.id,
                    Inventory.store_id == store.id,
                    Inventory.product_variant_id == variant.id,
                )
                .first()
            )
            if not exists_inv:
                db.add(
                    Inventory(
                        organization_id=org.id,
                        store_id=store.id,
                        product_variant_id=variant.id,
                        on_hand_quantity=Decimal(str(stock_qty)),
                        reserved_quantity=Decimal("0"),
                    )
                )

        # 3. Enrich existing products with categories & option groups
        updated_existing = 0
        for prod_code, (cat_code, opt_codes) in EXISTING_PRODUCT_MAPPINGS.items():
            prod = (
                db.query(Product)
                .filter(Product.organization_id == org.id, Product.product_code == prod_code)
                .first()
            )
            if not prod:
                continue
            cat = cat_by_code.get(cat_code)
            if cat:
                if prod.category_id is None:
                    prod.category_id = cat.id
                exists_pc = (
                    db.query(ProductCategory)
                    .filter(
                        ProductCategory.organization_id == org.id,
                        ProductCategory.product_id == prod.id,
                        ProductCategory.category_id == cat.id,
                    )
                    .first()
                )
                if not exists_pc:
                    db.add(
                        ProductCategory(
                            organization_id=org.id,
                            product_id=prod.id,
                            category_id=cat.id,
                        )
                    )
            variants = (
                db.query(ProductVariant)
                .filter(
                    ProductVariant.organization_id == org.id,
                    ProductVariant.product_id == prod.id,
                )
                .all()
            )
            for v in variants:
                ensure_variant_links(v, opt_codes, stock_qty=100)
            updated_existing += 1

        # 4. Seed new products + variants + barcodes
        created_products = 0
        created_variants = 0
        barcode_seq = 1001

        for p_data in NEW_PRODUCTS_DATA:
            existing_prod = (
                db.query(Product)
                .filter(Product.organization_id == org.id, Product.product_code == p_data["code"])
                .first()
            )
            if existing_prod:
                continue

            cat = cat_by_code[p_data["category"]]
            prod = Product(
                organization_id=org.id,
                category_id=cat.id,
                product_code=p_data["code"],
                name=p_data["name"],
                description=p_data["description"],
                product_type="stocked",
                track_inventory=True,
                status="active",
                version=1,
                created_by=actor_id,
                updated_by=actor_id,
            )
            db.add(prod)
            db.flush()

            db.add(
                ProductCategory(
                    organization_id=org.id,
                    product_id=prod.id,
                    category_id=cat.id,
                )
            )

            created_var_objs: List[ProductVariant] = []
            for v_idx, v_data in enumerate(p_data["variants"]):
                var = ProductVariant(
                    organization_id=org.id,
                    product_id=prod.id,
                    variant_code=v_data["code"],
                    variant_name=v_data["name"],
                    sku=v_data["code"],
                    unit_name=v_data["unit"],
                    default_cost=Decimal(v_data["cost"]),
                    default_price=Decimal(v_data["price"]),
                    currency_code="VND",
                    is_default=(v_idx == 0),
                    status="active",
                    version=1,
                )
                db.add(var)
                db.flush()

                barcode_val = _ean13_from_seed(barcode_seq)
                barcode_seq += 1
                while (
                    db.query(ProductBarcode)
                    .filter(
                        ProductBarcode.organization_id == org.id,
                        ProductBarcode.barcode == barcode_val,
                    )
                    .first()
                    is not None
                ):
                    barcode_val = _ean13_from_seed(barcode_seq)
                    barcode_seq += 1

                db.add(
                    ProductBarcode(
                        organization_id=org.id,
                        product_variant_id=var.id,
                        barcode=barcode_val,
                        barcode_type="EAN13",
                        is_primary=True,
                    )
                )

                ensure_variant_links(var, p_data["options"], stock_qty=v_data["stock"])
                created_var_objs.append(var)
                created_variants += 1

            db.flush()
            db.add(
                CatalogChangeLog(
                    organization_id=org.id,
                    stream_name="catalog",
                    entity_type="product",
                    change_type="upsert",
                    entity_id=prod.id,
                    version=prod.version,
                    payload=_serialize_product(db, prod),
                )
            )
            for v in created_var_objs:
                db.add(
                    CatalogChangeLog(
                        organization_id=org.id,
                        stream_name="catalog",
                        entity_type="product_variant",
                        change_type="upsert",
                        entity_id=v.id,
                        version=v.version,
                        payload=_serialize_variant(db, v),
                    )
                )

            created_products += 1

        db.commit()
        print(
            f"Seed completed successfully for org '{org.code}':\n"
            f"  - Categories created: {created_cats}\n"
            f"  - Option Groups created: {created_opt_groups} (Option Items: {created_opt_items})\n"
            f"  - Existing products enriched: {updated_existing}\n"
            f"  - New products created: {created_products} (Variants: {created_variants})"
        )


if __name__ == "__main__":
    seed()
