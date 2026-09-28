# Ma Sói Web - MVP

Web quản trò Ma Sói cho người thật chơi trên điện thoại.

## Luật đã áp dụng
- Role: Sói, Dân, Tiên tri, Bảo vệ, Phù thủy, Ti Hí, Cupid, Ma cà rồng.
- Không lộ role khi chết; chỉ reveal role khi kết thúc ván.
- Ti Hí chỉ thấy **nạn nhân Sói chọn cắn vào đêm chẵn**.
- Ma cà rồng là phe thứ 3, cắn gây chết. **Chỉ Bảo vệ cứu được nạn nhân Ma cà rồng**.
- Tiên tri soi Ma cà rồng vẫn thấy **Phe Dân làng**.
- Ma cà rồng thắng khi là **người sống sót cuối cùng**.
- Cupid ghép 2 người; một người chết thì người kia chết theo.
- Phù thủy chỉ cứu được nạn nhân Sói, không cứu được nạn nhân Ma cà rồng.
- Có chat chung, chat phe Sói, chat Ma cà rồng.

## Chạy trên máy
1. Cài Node.js 18+.
2. Mở Terminal trong thư mục này.
3. Chạy:
   npm install
   npm start
4. Mở http://localhost:3000

## Để chơi nhiều điện thoại
Cần deploy app lên Internet. Project có thể deploy lên dịch vụ Node.js hosting như Render/Railway/Fly.io hoặc VPS.

## Lưu ý MVP
- Trạng thái game đang nằm trong RAM. Nếu server restart giữa ván, ván hiện tại sẽ mất.
- Chưa có tài khoản/đăng nhập.
- Chưa có database lịch sử lâu dài.
