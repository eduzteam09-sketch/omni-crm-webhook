const express = require('express');
const app = express();
app.use(express.json()); // Bật chế độ đọc dữ liệu JSON

// Mã bí mật bạn tự đặt để xác minh với Facebook
const VERIFY_TOKEN = 'omni_crm_secret_2026';

/* ==========================================
   1. API GET: Để Facebook kiểm tra xác minh 
   ========================================== */
app.get('/webhook/facebook', (req, res) => {
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  // Kiểm tra xem mã Facebook gửi qua có khớp với mã của mình không
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Xác minh thành công!');
      res.status(200).send(challenge); // Bắt buộc phải trả về challenge
    } else {
      res.sendStatus(403); // Sai mã, từ chối
    }
  }
});

/* ==========================================
   2. API POST: Để nhận tin nhắn khách hàng gửi tới 
   ========================================== */
app.post('/webhook/facebook', (req, res) => {
  let body = req.body;

  // Kiểm tra xem dữ liệu có đúng là từ Fanpage gửi tới không
  if (body.object === 'page') {
    body.entry.forEach(function (entry) {
      // Lấy nội dung tin nhắn
      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id; // ID khách hàng
      let message_text = webhook_event.message.text; // Nội dung khách chat

      console.log(
        'Khách hàng ID ' + sender_psid + ' vừa nhắn: ' + message_text
      );

      // ---> TẠI ĐÂY: Lập trình viên sẽ viết code chuyển "message_text"
      // qua AI xử lý, sau đó lưu thành Lead hoặc tạo Đơn hàng vào CRM.
    });

    // Bắt buộc phải báo lại cho Facebook là "Tôi đã nhận được tin nhắn" (Status 200)
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Chạy server ở cổng 3000
app.listen(3000, () => console.log('Webhook đang chạy ở cổng 3000...'));
