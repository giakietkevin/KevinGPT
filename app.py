from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from flask import send_from_directory
from flask_cors import CORS
from openai import OpenAI
import os
import base64
import io
import PyPDF2
import sys
import time

app = Flask(__name__)
CORS(app)

# Dev: disable caching so frontend always loads latest JS/CSS
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["TEMPLATES_AUTO_RELOAD"] = True


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Initialize OpenAI client
client = OpenAI(
    base_url="http://127.0.0.1:8045/v1",
    api_key="sk-640434c127414d4f8ff37809858cb0c5"
)

@app.route('/')
def index():
    # cache-bust static assets
    return render_template('index.html', version=str(int(time.time())))

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"ok": True})

@app.route('/site.webmanifest', methods=['GET'])
def webmanifest():
    # Compatibility: allow /site.webmanifest to resolve to static/site.webmanifest
    return send_from_directory(os.path.join(app.root_path, "static"), "site.webmanifest")

def _normalize_image_content_to_data_url(content: str):
    """
    Try to normalize various possible model outputs to a data URL.
    Supports:
    - data:image/...;base64,...
    - bare base64 (assume png)
    - markdown image: ![](URL)
    - plain URL (returns as-is; frontend can open)
    """
    if not content:
        return None, None

    c = content.strip()
    if c.startswith("data:image/"):
        return c, None

    # markdown image ![alt](url)
    if "](" in c and ")" in c and "![" in c:
        import re
        m = re.search(r"!\[[^\]]*\]\(([^)]+)\)", c)
        if m:
            url = m.group(1).strip()
            if url.startswith("data:image/"):
                return url, None
            return None, url

    # plain url
    if c.startswith("http://") or c.startswith("https://"):
        return None, c

    # bare base64 heuristic
    if len(c) > 200 and all(ch.isalnum() or ch in "+/=\n\r" for ch in c):
        b64 = "".join(c.split())
        return f"data:image/png;base64,{b64}", None

    return None, None


@app.route('/api/image', methods=['POST'])
def generate_image():
    """
    Generate image from prompt using gemini-3-pro-image.
    Accepts JSON: { prompt, size, model }
    """
    try:
        data = request.json or {}
        prompt = (data.get("prompt") or "").strip()
        size = (data.get("size") or "1024x1024").strip()
        model = (data.get("model") or "gemini-3-pro-image").strip()

        if not prompt:
            return jsonify({"success": False, "error": "Prompt is required"}), 400

        # Call image model via chat.completions with extra_body size (per your spec)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            extra_body={"size": size},
        )

        content = resp.choices[0].message.content or ""
        data_url, url = _normalize_image_content_to_data_url(content)

        return jsonify({
            "success": True,
            "image_data_url": data_url,
            "image_url": url,
            "raw": content,
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        user_message = data.get('message', '')
        
        if not user_message:
            return jsonify({'error': 'Message is required'}), 400
        
        # Call OpenAI API
        response = client.chat.completions.create(
            model="gemini-3-flash",
            messages=[{"role": "user", "content": user_message}]
        )
        
        ai_response = response.choices[0].message.content
        
        return jsonify({
            'success': True,
            'message': ai_response
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/chat-stream', methods=['POST'])
def chat_stream():
    """
    Streaming endpoint: trả lời lần lượt từng phần text.
    Hỗ trợ xử lý hình ảnh và file đính kèm (PDF/txt/json/csv).
    """

    @stream_with_context
    def generate():
        data = request.json or {}
        user_message = data.get("message", "")
        images = data.get("images", [])  # List of base64 images
        files = data.get("files", [])    # List of {name, content}
        model = data.get("model") or "gemini-3-pro-high"

        if not user_message and not images and not files:
            yield "Lỗi: yêu cầu không có nội dung.\n"
            return

        try:
            # Log basic request info
            print(
                f"[chat-stream] message_len={len(user_message) if user_message else 0}, "
                f"images={len(images)}, files={len(files)}",
                file=sys.stderr,
            )

            # Giới hạn dung lượng payload (khoảng 8MB tổng base64)
            total_size = sum(len(img or "") for img in images) + sum(len(f.get("content", "") or "") for f in files)
            if total_size > 8 * 1024 * 1024:
                yield "Payload quá lớn (>{} MB). Vui lòng gửi file nhỏ hơn.\n".format(8)
                return

            # Build message content
            content = []

            # Add images (vision)
            for img_base64 in images:
                # img_base64 format: "data:image/jpeg;base64,..."
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": img_base64
                    }
                })

            # Add file info to message if any
            file_context = ""
            for f in files:
                file_name = f.get("name", "unknown")
                file_content = f.get("content", "")
                parsed_text = parse_file_content(file_name, file_content)
                file_context += parsed_text

            # Combine message with file context
            full_message = user_message or "Phân tích nội dung đính kèm."
            if file_context:
                full_message += file_context

            # Add text message
            if full_message:
                content.append({
                    "type": "text",
                    "text": full_message
                })

            # Use simple text if no images
            if not images:
                messages = [{"role": "user", "content": full_message}]
            else:
                messages = [{"role": "user", "content": content}]

            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
            )

            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta

        except Exception as e:
            print(f"[chat-stream][error] {e}", file=sys.stderr)
            yield f"\n[Đã xảy ra lỗi: {str(e)}]\n"

    return Response(generate(), mimetype="text/plain; charset=utf-8")


def parse_file_content(file_name: str, file_content: str) -> str:
    """
    Trích xuất nội dung từ file đính kèm (base64).
    Hỗ trợ: pdf, txt, csv, json. Các loại khác sẽ gửi thông tin metadata.
    """
    if "base64," not in file_content:
        return f"\n\n[File {file_name}: không có dữ liệu base64]\n"

    try:
        b64_data = file_content.split("base64,", 1)[1]
        raw_bytes = base64.b64decode(b64_data)
    except Exception:
        return f"\n\n[File {file_name}: lỗi giải mã base64]\n"

    lower_name = file_name.lower()

    # PDF
    if lower_name.endswith(".pdf"):
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(raw_bytes))
            texts = []
            for page in reader.pages:
                texts.append(page.extract_text() or "")
            merged = "\n".join(texts)
            trimmed = merged[:8000]  # tránh quá dài
            return f"\n\n--- Nội dung file {file_name} (PDF) ---\n{trimmed}\n--- Hết file ---\n"
        except Exception:
            # Fall back to raw notice
            return f"\n\n[File {file_name}: không đọc được PDF, gửi kèm nội dung gốc dạng nhị phân mã hóa base64]\n"

    # Text-like files
    if lower_name.endswith((".txt", ".csv", ".json", ".md", ".log")):
        try:
            text = raw_bytes.decode("utf-8", errors="ignore")
            trimmed = text[:8000]
            return f"\n\n--- Nội dung file {file_name} ---\n{trimmed}\n--- Hết file ---\n"
        except Exception:
            return f"\n\n[File {file_name}: không đọc được nội dung văn bản]\n"

    # Other types: just mention
    return f"\n\n[File {file_name}: loại không được hỗ trợ, gửi kèm metadata]\n"

if __name__ == '__main__':
    app.run(debug=True, port=5000)

