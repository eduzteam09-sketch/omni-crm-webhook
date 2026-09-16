const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const app = express();
app.use(express.json());

const VERIFY_TOKEN = "omni_crm_secret_2026"; 
// ---> DÁN MÃ ACCESS TOKEN CỦA BẠN VÀO ĐÂY <---
const PAGE_ACCESS_TOKEN = "EAANRFZCxPZC9QBSUF0O2ZCYjlWAh6bwyoX1yLpTmgr54ePhlGdFz4wXULpi86yZAvZAvZB7fZBAhQxL81JqSWMmyhcTNQb0jjGDyfiDWf9GLFZC8FZARiCGPACdWwnDDCZAtudEZAIG9fLyZCKxRgVDHp8by9TrpVZAiq5ZAvodYcQBrXdKcwPy22pzgoQCVPuZCf6k0NiOcMzpNgYWVp0KgM9fZCBc96gZDZD"; 

/* ==========================================
   KẾT NỐI DATABASE MONGODB
   ========================================== */
// ---> DÁN CHUỖI KẾT NỐI MONGODB CỦA BẠN VÀO ĐÂY <---
const MONGO_URI = "mongodb+srv://eduzteam09_db_user:7m5KjuPM3P1FVMsv@crm-omni.b2j6acf.mongodb.net/?appName=crm-omni";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Đã kết nối thành công với Database MongoDB!'))
  .catch(err => console.error('Lỗi kết nối Database:', err));

// 1. Cập nhật Schema cho giống với giao diện CRM (Thêm phone, source, aiScore)
const leadSchema = new mongoose.Schema({
    facebookId: String,
    customerName: String,
    phone: { type: String, default: '' }, // Thêm SĐT
    lastMessage: String,
    source: { type: String, default: 'Facebook Messenger' }, // Thêm Nguồn
    status: { type: String, default: 'Mới' },
    aiScore: { type: Number, default: 50 }, // Thêm điểm AI giả định
    createdAt: { type: Date, default: Date.now }
});
const Lead = mongoose.model('Lead', leadSchema);

/* ==========================================
   HÀM 1: LẤY TÊN THẬT CỦA KHÁCH TỪ FACEBOOK
   ========================================== */
async function getCustomerName(sender_psid) {
    try {
        // Gọi API Graph của FB để lấy Profile (cần access token)
        const response = await axios.get(`https://graph.facebook.com/${sender_psid}`, {
            params: {
                fields: 'first_name,last_name,name',
                access_token: PAGE_ACCESS_TOKEN
            }
        });
        // Trả về tên đầy đủ, nếu không có thì trả về ID
        return response.data.name || `Khách FB ${sender_psid}`; 
    } catch (error) {
        console.error("Lỗi khi lấy tên khách hàng từ FB:", error.message);
        return `Khách FB ${sender_psid}`; // Fallback nếu lỗi
    }
}

/* ==========================================
   HÀM 2: GỬI TIN NHẮN TRẢ LỜI
   ========================================== */
async function callSendAPI(sender_psid, response_text) {
    const request_body = {
        "recipient": { "id": sender_psid },
        "message": { "text": response_text }
    };
    try {
        await axios.post('https://graph.facebook.com/v19.0/me/messages', request_body, {
            params: { access_token: PAGE_ACCESS_TOKEN }
        });
        console.log(`Đã trả lời tự động cho khách: ${sender_psid}`);
    } catch (err) {
        console.error("Lỗi khi gửi tin nhắn:", err.message);
    }
}

/* ==========================================
   API GET: Xác minh với Facebook
   ========================================== */
app.get('/webhook/facebook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

/* ==========================================
   API POST: Xử lý Webhook & Tránh Double Message
   ========================================== */
app.post('/webhook/facebook', async (req, res) => {
    let body = req.body;

    // PHẢI TRẢ LỜI FACEBOOK NGAY LẬP TỨC TRƯỚC KHI XỬ LÝ (Tránh timeout/retry)
    res.status(200).send('EVENT_RECEIVED');

    if (body.object === 'page') {
        for (let entry of body.entry) {
            
            // Đảm bảo event có tin nhắn
            if (!entry.messaging || !entry.messaging[0]) continue;
            
            let webhook_event = entry.messaging[0];
            
            // 2. Lọc bỏ sự kiện 'echo' (Tin nhắn do chính Page/Bot gửi) -> Tránh lỗi Double
            if (webhook_event.message && webhook_event.message.is_echo) {
                console.log("Bỏ qua tin nhắn do Page tự gửi (echo).");
                continue; 
            }
            
            // Bỏ qua nếu không phải tin nhắn text (ví dụ: read receipt, delivery...)
            if (!webhook_event.message || !webhook_event.message.text) {
                 continue;
            }

            let sender_psid = webhook_event.sender.id; 
            let message_text = webhook_event.message.text;

            console.log(`Nhận tin từ ${sender_psid}: ${message_text}`);

            try {
                // Kiểm tra Database
                let existingLead = await Lead.findOne({ facebookId: sender_psid });
                let reply_text = "";

                if (!existingLead) {
                    // 3. Nếu là Lead mới -> Gọi hàm lấy tên thật từ Facebook
                    let realName = await getCustomerName(sender_psid);
                    
                    const newLead = new Lead({ 
                        facebookId: sender_psid, 
                        customerName: realName, // Lưu tên thật vào DB
                        lastMessage: message_text,
                        aiScore: Math.floor(Math.random() * (95 - 60 + 1) + 60) // Random điểm AI từ 60-95
                    });
                    await newLead.save();
                    console.log(`-> Tạo Lead thành công cho: ${realName}`);
                    
                    reply_text = `Xin chào ${realName}! Chúng tôi hân hạnh được phục vụ bạn`;
                } else {
                    // Nếu là khách cũ
                    existingLead.lastMessage = message_text;
                    // Nếu muốn, bạn có thể phân tích số điện thoại từ tin nhắn để lưu vào existingLead.phone ở đây
                    await existingLead.save();
                    console.log(`-> Cập nhật Lead thành công cho: ${existingLead.customerName}`);
                    
                    reply_text = `Dạ chúng tôi đã nhận được yêu cầu: "${message_text}". Hệ thống đã cập nhật thông tin.`;
                }

                // Gửi tin nhắn trả lời
                await callSendAPI(sender_psid, reply_text);

            } catch (error) {
                console.error("Lỗi xử lý Data:", error);
            }
        }
    }
});

app.listen(3000, () => console.log('Webhook & Database đang chạy ở cổng 3000...'));
