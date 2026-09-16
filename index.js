const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const moment = require('moment-timezone'); // Thêm thư viện xử lý múi giờ
const app = express();
app.use(express.json());

const VERIFY_TOKEN = "omni_crm_secret_2026"; 
const PAGE_ACCESS_TOKEN = "EAANRFZCxPZC9QBSUF0O2ZCYjlWAh6bwyoX1yLpTmgr54ePhlGdFz4wXULpi86yZAvZAvZB7fZBAhQxL81JqSWMmyhcTNQb0jjGDyfiDWf9GLFZC8FZARiCGPACdWwnDDCZAtudEZAIG9fLyZCKxRgVDHp8by9TrpVZAiq5ZAvodYcQBrXdKcwPy22pzgoQCVPuZCf6k0NiOcMzpNgYWVp0KgM9fZCBc96gZDZD"; 

/* ==========================================
   KẾT NỐI DATABASE MONGODB
   ========================================== */
const MONGO_URI = "mongodb+srv://eduzteam09_db_user:7m5KjuPM3P1FVMsv@crm-omni.b2j6acf.mongodb.net/?appName=crm-omni";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Đã kết nối thành công với Database MongoDB!'))
  .catch(err => console.error('Lỗi kết nối Database:', err));

// 1. Cập nhật Schema: Đổi createdAt thành kiểu String để ép lưu giờ Việt Nam
const leadSchema = new mongoose.Schema({
    facebookId: String,
    customerName: String,
    phone: { type: String, default: '' },
    lastMessage: String,
    source: { type: String, default: 'Facebook Messenger' },
    status: { type: String, default: 'Mới' },
    aiScore: { type: Number, default: 50 },
    createdAt: { type: String } // Đổi từ Date sang String
});
const Lead = mongoose.model('Lead', leadSchema);

/* ==========================================
   HÀM: LẤY TÊN THẬT CỦA KHÁCH TỪ FACEBOOK
   ========================================== */
async function getCustomerName(sender_psid) {
    try {
        const response = await axios.get(`https://graph.facebook.com/${sender_psid}`, {
            params: {
                fields: 'name',
                access_token: PAGE_ACCESS_TOKEN
            }
        });
        return response.data.name || `Khách FB ${sender_psid}`; 
    } catch (error) {
        console.error("Lỗi khi lấy tên khách từ FB:", error.response ? error.response.data : error.message);
        return `Khách FB ${sender_psid}`; 
    }
}

/* ==========================================
   HÀM: GỬI TIN NHẮN TRẢ LỜI
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
    } catch (err) {
        console.error("Lỗi khi gửi tin nhắn:", err.response ? err.response.data : err.message);
    }
}

/* ==========================================
   HÀM: LẤY GIỜ HIỆN TẠI TẠI VIỆT NAM (UTC+7)
   ========================================== */
function getVietnamTime() {
    // Trả về chuỗi định dạng VD: "16/09/2026 17:10:04"
    return moment().tz("Asia/Ho_Chi_Minh").format("DD/MM/YYYY HH:mm:ss");
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
   API POST: Xử lý Webhook
   ========================================== */
app.post('/webhook/facebook', async (req, res) => {
    let body = req.body;
    res.status(200).send('EVENT_RECEIVED'); // Phản hồi FB ngay lập tức

    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (!entry.messaging || !entry.messaging[0]) continue;
            let webhook_event = entry.messaging[0];
            
            // Bỏ qua tin nhắn do Page tự gửi (echo)
            if (webhook_event.message && webhook_event.message.is_echo) continue; 
            if (!webhook_event.message || !webhook_event.message.text) continue;

            let sender_psid = webhook_event.sender.id; 
            let message_text = webhook_event.message.text;
            let currentVnTime = getVietnamTime();

            try {
                let existingLead = await Lead.findOne({ facebookId: sender_psid });
                let reply_text = "";

                if (!existingLead) {
                    // KHÁCH MỚI
                    let realName = await getCustomerName(sender_psid);
                    
                    const newLead = new Lead({ 
                        facebookId: sender_psid, 
                        customerName: realName, 
                        lastMessage: message_text,
                        aiScore: Math.floor(Math.random() * (95 - 60 + 1) + 60),
                        createdAt: currentVnTime // Lưu cứng chuỗi giờ VN
                    });
                    await newLead.save();
                    
                    reply_text = `Omni CRM xin chào ${realName}! Hệ thống đã tự động tạo hồ sơ khách hàng (Lead) mới cho bạn.`;
                } else {
                    // KHÁCH CŨ
                    existingLead.lastMessage = message_text;
                    
                    // FIX: Nếu tên khách trong DB vẫn đang là "Khách FB" (do lỗi phiên bản trước), lấy lại tên thật
                    if (existingLead.customerName.includes("Khách FB")) {
                        let realName = await getCustomerName(sender_psid);
                        existingLead.customerName = realName;
                    }
                    
                    await existingLead.save();
                    reply_text = `Dạ Omni CRM đã nhận được yêu cầu: "${message_text}". Hệ thống đã cập nhật thông tin lúc ${currentVnTime}.`;
                }

                await callSendAPI(sender_psid, reply_text);

            } catch (error) {
                console.error("Lỗi xử lý Data:", error);
            }
        }
    }
});

app.listen(3000, () => console.log('Webhook đang chạy...'));
