const express = require('express');
const mongoose = require('mongoose'); // Thêm thư viện database
const app = express();
app.use(express.json());

const VERIFY_TOKEN = "omni_crm_secret_2026"; 

/* ==========================================
   KẾT NỐI DATABASE MONGODB
   ========================================== */
// Thay chuỗi kết nối của bạn vào đây (Nhớ thay username và password)
const MONGO_URI = "mongodb+srv://eduzteam09_db_user:7m5KjuPM3P1FVMsv@crm-omni.b2j6acf.mongodb.net/?appName=crm-omni";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Đã kết nối thành công với Database MongoDB!'))
  .catch(err => console.error('Lỗi kết nối Database:', err));

/* ==========================================
   ĐỊNH NGHĨA CẤU TRÚC (MODEL) CHO LEAD
   ========================================== */
const leadSchema = new mongoose.Schema({
    facebookId: String,       // ID khách hàng trên FB
    customerName: String,     // Tên khách (Có thể lấy từ FB Profile API)
    lastMessage: String,      // Nội dung tin nhắn cuối cùng
    status: { type: String, default: 'Mới' }, // Trạng thái mặc định
    source: { type: String, default: 'Facebook Messenger' },
    createdAt: { type: Date, default: Date.now }
});

const Lead = mongoose.model('Lead', leadSchema);

/* ==========================================
   1. API GET: Xác minh với Facebook (Giữ nguyên)
   ========================================== */
app.get('/webhook/facebook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log("Xác minh Webhook thành công!");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

/* ==========================================
   2. API POST: Nhận tin và LƯU DATABASE
   ========================================== */
app.post('/webhook/facebook', async (req, res) => { // Lưu ý thêm chữ 'async'
    let body = req.body;

    if (body.object === 'page') {
        // Dùng vòng lặp for...of để dùng được await với Database
        for (let entry of body.entry) {
            let webhook_event = entry.messaging[0];
            let sender_psid = webhook_event.sender.id; 
            let message_text = webhook_event.message.text;

            console.log(`Nhận tin nhắn từ ID ${sender_psid}: ${message_text}`);

            try {
                // KIỂM TRA & LƯU VÀO DATABASE
                // Kiểm tra xem khách này đã từng chat chưa (đã có Lead chưa)
                let existingLead = await Lead.findOne({ facebookId: sender_psid });

                if (!existingLead) {
                    // Nếu khách mới tinh -> Tạo Lead mới
                    const newLead = new Lead({
                        facebookId: sender_psid,
                        customerName: "Khách FB " + sender_psid, // Tạm đặt tên, sau này dùng API FB lấy tên thật
                        lastMessage: message_text
                    });
                    await newLead.save(); // Lệnh lưu vào Database
                    console.log("-> Đã tạo mới 1 Lead thành công trong Database!");
                } else {
                    // Nếu khách cũ -> Cập nhật tin nhắn mới nhất
                    existingLead.lastMessage = message_text;
                    await existingLead.save();
                    console.log("-> Đã cập nhật tin nhắn cho Lead hiện tại.");
                }
            } catch (error) {
                console.error("Lỗi khi lưu Database:", error);
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

app.listen(3000, () => console.log('Webhook & Database đang chạy ở cổng 3000...'));
