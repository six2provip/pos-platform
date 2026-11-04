import PosTerminalStandalone from "@/components/pos-terminal-standalone";

export const metadata = {
  title: "POS Terminal — Màn Hình Máy POS Android Tại Quầy",
  description:
    "Giao diện Kiosk độc lập giả lập phần cứng máy POS Android Sunmi / Pax phục vụ ghép nối 6 chữ số và bán hàng tại quầy.",
};

export default function TerminalPage() {
  return <PosTerminalStandalone />;
}

