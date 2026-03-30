## FakeGemini - AI Chat Interface

Ứng dụng web chat AI với giao diện đẹp mắt và sang trọng, tương tự Google Gemini.

## Tính năng

- ✨ Giao diện hiện đại, đẹp mắt với gradient và animations
- 💬 Chat với AI thông minh
- 📱 Responsive design
- 🎨 Dark theme sang trọng
- 💾 Lưu lịch sử chat
- ⚡ Tốc độ phản hồi nhanh

## Cài đặt

1. Cài đặt các dependencies:
```bash
pip install -r requirements.txt
```

2. Chạy ứng dụng:
```bash
python app.py
```

3. Mở trình duyệt và truy cập:
```
http://localhost:5000
```

## Cấu trúc dự án

```
FakeGemini/
├── app.py                 # Flask backend
├── templates/
│   └── index.html        # Frontend HTML
├── static/
│   ├── css/
│   │   └── style.css    # Styling
│   └── js/
│       └── script.js    # JavaScript logic
├── requirements.txt      # Python dependencies
└── README.md            # Documentation
```

## Sử dụng

1. Nhập câu hỏi vào ô input ở cuối trang
2. Nhấn Enter hoặc click nút Send để gửi
3. AI sẽ trả lời trong vài giây
4. Click "Cuộc trò chuyện mới" để bắt đầu lại

## Lưu ý

- Đảm bảo API server đang chạy tại `http://127.0.0.1:8045`
- API key đã được cấu hình sẵn trong `app.py`

## Công nghệ sử dụng

- **Backend**: Flask (Python)
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **API**: OpenAI-compatible API
- **Fonts**: Google Fonts (Inter)

"# KevinGPT" 
