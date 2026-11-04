import { CategoryId } from "./pos-types";

export interface TableItem {
  id: string;
  name: string;
  zone: "ground" | "garden" | "vip" | "takeaway";
  zoneName: string;
  status: "available" | "occupied" | "reserved";
  guests: number;
  seatedMinutes?: number;
  currentOrderCode?: string;
  currentAmount?: number;
}

export const INITIAL_TABLES: TableItem[] = [
  { id: "t1", name: "Table 01", zone: "ground", zoneName: "Tầng Trệt", status: "occupied", guests: 2, seatedMinutes: 25, currentOrderCode: "ORD-9102", currentAmount: 114000 },
  { id: "t2", name: "Table 02", zone: "ground", zoneName: "Tầng Trệt", status: "available", guests: 0 },
  { id: "t3", name: "Table 03", zone: "ground", zoneName: "Tầng Trệt", status: "occupied", guests: 4, seatedMinutes: 42, currentOrderCode: "ORD-9105", currentAmount: 235000 },
  { id: "t4", name: "Table 04", zone: "ground", zoneName: "Tầng Trệt", status: "available", guests: 0 },
  { id: "t5", name: "Table 05", zone: "ground", zoneName: "Tầng Trệt", status: "occupied", guests: 3, seatedMinutes: 15, currentOrderCode: "ORD-9110", currentAmount: 168000 },
  { id: "t6", name: "Table 06", zone: "ground", zoneName: "Tầng Trệt", status: "available", guests: 0 },
  { id: "t7", name: "Table 07", zone: "garden", zoneName: "Sân Vườn", status: "occupied", guests: 2, seatedMinutes: 35, currentOrderCode: "ORD-9098", currentAmount: 89000 },
  { id: "t8", name: "Table 08", zone: "garden", zoneName: "Sân Vườn", status: "available", guests: 0 },
  { id: "t9", name: "Table 09", zone: "garden", zoneName: "Sân Vườn", status: "available", guests: 0 },
  { id: "t10", name: "Table 10 (VIP)", zone: "vip", zoneName: "Phòng VIP", status: "occupied", guests: 8, seatedMinutes: 60, currentOrderCode: "ORD-9080", currentAmount: 680000 },
  { id: "t11", name: "Table 11 (VIP)", zone: "vip", zoneName: "Phòng VIP", status: "available", guests: 0 },
  { id: "t12", name: "Table 21", zone: "ground", zoneName: "Tầng Trệt", status: "occupied", guests: 2, seatedMinutes: 10, currentOrderCode: "ORD-9115", currentAmount: 145000 },
  { id: "t13", name: "Counter 01", zone: "takeaway", zoneName: "Mang Đi", status: "available", guests: 0 },
  { id: "t14", name: "Counter 02", zone: "takeaway", zoneName: "Mang Đi", status: "available", guests: 0 },
];

export interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  tier: "VIP Diamond" | "VIP Gold" | "Thành Viên";
  discountPercent: number;
  points: number;
  totalOrders: number;
  lastVisit: string;
}

export const INITIAL_CUSTOMERS: CustomerItem[] = [
  { id: "c1", name: "Trần Anh Tuấn", phone: "0908 123 456", tier: "VIP Gold", discountPercent: 10, points: 1450, totalOrders: 38, lastVisit: "Hôm nay 09:30" },
  { id: "c2", name: "Nguyễn Thị Mai", phone: "0912 345 678", tier: "VIP Diamond", discountPercent: 15, points: 3200, totalOrders: 72, lastVisit: "Hôm qua" },
  { id: "c3", name: "Lê Hoàng Long", phone: "0987 654 321", tier: "Thành Viên", discountPercent: 5, points: 520, totalOrders: 12, lastVisit: "3 ngày trước" },
  { id: "c4", name: "Phạm Thúy Hằng", phone: "0933 888 999", tier: "VIP Gold", discountPercent: 10, points: 1890, totalOrders: 45, lastVisit: "Hôm nay 10:15" },
  { id: "c5", name: "Đặng Văn Nam", phone: "0977 112 233", tier: "Thành Viên", discountPercent: 5, points: 310, totalOrders: 8, lastVisit: "1 tuần trước" },
];

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  type: "order" | "stock" | "sync" | "hardware";
  read: boolean;
}

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  { id: "n1", title: "Đơn hàng mới tại quầy", detail: "Hóa đơn ORD-9115 (145.000 ₫) vừa thanh toán thành công", time: "2 phút trước", type: "order", read: false },
  { id: "n2", title: "Cảnh báo tồn kho sắp hết", detail: "Bánh Tiramisu Cà Phê Ý chỉ còn 5 phần trong kho quầy", time: "15 phút trước", type: "stock", read: false },
  { id: "n3", title: "Đồng bộ Offline thành công", detail: "Đã đồng bộ 2 đơn hàng Outbox lên Cloud an toàn", time: "30 phút trước", type: "sync", read: true },
  { id: "n4", title: "Máy in nhiệt K80 sẵn sàng", detail: "Kết nối cổng USB 80mm ESC/POS đã kích hoạt", time: "1 giờ trước", type: "hardware", read: true },
];
