const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios'); // Thêm thư viện để gọi API gửi tin nhắn
const app = express();
app.use(express.json());

const VERIFY_TOKEN = "omni_crm_secret_2026"; 
// ---> DÁN MÃ ACCESS TOKEN VỪA COPY TRÊN FACEBOOK VÀO ĐÂY <---
const PAGE_ACCESS_TOKEN = "EAANRFZCxPZC9QBSUF0O2ZCYjlWAh6bwyoX1yLpTmgr54ePhlGdFz4wXULpi86yZAvZAvZB7fZBAhQxL81JqSWMmyhcTNQb0jjGDyfiDWf9GLFZC8FZARiCGPACdWwnDDCZAtudEZAIG9fLyZCKxRgVDHp8by9TrpVZAiq5ZAvodYcQBrXdKcwPy22pzgoQCVPuZCf6k0NiOcMzpNgYWVp0KgM9fZCBc96gZDZD"; 

/* ==========================================
   KẾT NỐI DATABASE MONGODB
   ========================================== */
const MONGO_URI = "mongodb+srv://eduzteam09_db_user:7m5KjuPM3P1FVMsv@crm-omni.b2j6acf.mongodb.net/?appName=crm-omni";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Đã kết nối thành công với Database MongoDB!'))
  .catch(err => console.error('Lỗi kết nối Database:', err));

const leadSchema = new mongoose.Schema({
    facebookId: String,
    customerName: String,
    lastMessage: String,
    status: { type: String, default: 'Mới' },
    createdAt: { type: Date, default: Date.now }
});
const Lead = mongoose.model('Lead', leadSchema);

/* ==========================================
   HÀM GỬI TIN NHẮN LẠI CHO KHÁCH (MỚI THÊM)
   ========================================== */
async function callSendAPI(sender_psid, response_text) {
    // Cấu trúc gói tin để gửi cho Facebook
    const request_body = {
        "recipient": { "id": sender_psid },
        "message": { "text": response_text }
    };

    try {
        // Bắn gói tin lên API của Facebook bằng Axios
        await axios.post('https://graph.facebook.com/v19.0/me/messages', request_body, {
            params: { access_token: PAGE_ACCESS_TOKEN }
        });
        console.log(`Đã trả lời tự động cho khách ID: ${sender_psid}`);
    } catch (err) {
        console.error("Lỗi khi gửi tin nhắn:", err.response ? err.response.data : err.message);
    }
}

/* ==========================================
   1. API GET: Xác minh với Facebook
   ========================================== */
app.get('/webhook/facebook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log("Xác minh Webhook thành công!");
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

/* ==========================================
   2. API POST: Nhận tin -> Lưu DB -> Gửi phản hồi
   ========================================== */
app.post('/webhook/facebook', async (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        for (let entry of body.entry) {
            let webhook_event = entry.messaging[0];
            let sender_psid = webhook_event.sender.id; 
            let message_text = webhook_event.message.text;

            console.log(`Nhận tin: ${message_text}`);

            try {
                // 1. Lưu hoặc Cập nhật Database
                let existingLead = await Lead.findOne({ facebookId: sender_psid });
                let reply_text = "";

                if (!existingLead) {
                    const newLead = new Lead({ facebookId: sender_psid, customerName: "Khách FB", lastMessage: message_text });
                    await newLead.save();
                    console.log("-> Tạo Lead thành công!");
                    // Kịch bản trả lời khách MỚI
                    reply_text = "Omni CRM xin chào! Hệ thống đã tự động tạo hồ sơ khách hàng (Lead) mới cho bạn. Chúng tôi sẽ tư vấn ngay.";
                } else {
                    existingLead.lastMessage = message_text;
                    await existingLead.save();
                    console.log("-> Cập nhật Lead thành công!");
                    // Kịch bản trả lời khách CŨ
                    reply_text = `Dạ Omni CRM nhận được yêu cầu của bạn: "${message_text}". Hệ thống đã cập nhật thông tin.`;
                }

                // 2. Gọi hàm gửi tin nhắn lại cho khách
                await callSendAPI(sender_psid, reply_text);

            } catch (error) {
                console.error("Lỗi xử lý:", error);
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

app.listen(3000, () => console.log('Webhook & Database đang chạy ở cổng 3000...'));
