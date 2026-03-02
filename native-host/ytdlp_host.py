import sys
import os
import json
import struct
import shlex
import subprocess
import threading
import shutil

# Augment PATH so subprocess can find brew-installed yt-dlp
os.environ['PATH'] = f"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{os.environ.get('PATH', '')}"

# Chrome native messaging reads from stdin and writes to stdout.
# Messages are JSON objects preceded by 4-byte message length in native byte order.

def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        sys.exit(0)
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def encode_message(message_content):
    encoded_content = json.dumps(message_content).encode('utf-8')
    encoded_length = struct.pack('@I', len(encoded_content))
    return {'length': encoded_length, 'content': encoded_content}

def send_message(encoded_message):
    sys.stdout.buffer.write(encoded_message['length'])
    sys.stdout.buffer.write(encoded_message['content'])
    sys.stdout.buffer.flush()

def main():
    while True:
        try:
            msg = get_message()
            if not msg:
                continue

            # Expecting {"cmd": "-f bestvideo+bestaudio ...", "url": "https://..."}
            action = msg.get('action')
            if action == 'ping':
                send_message(encode_message({"status": "pong"}))
                continue

            if action == 'open_downloads':
                downloads_dir = os.path.expanduser('~/Downloads')
                # macOS specific open, but fallback just in case
                if sys.platform == 'darwin':
                    subprocess.Popen(['open', downloads_dir])
                elif sys.platform == 'win32':
                    os.startfile(downloads_dir)
                else:
                    subprocess.Popen(['xdg-open', downloads_dir])
                
                send_message(encode_message({"status": "opened"}))
                continue

            if action == 'download':
                cmd_string = msg.get('command', '')
                url = msg.get('url', '')
                task_id = msg.get('taskId', 'unknown')
                
                if not url:
                    send_message(encode_message({"error": "No URL provided", "taskId": task_id}))
                    continue

                # Build command: yt-dlp [flags] [url]
                # Force download into the user's Downloads folder
                downloads_dir = os.path.expanduser('~/Downloads')
                
                # Note: Assuming yt-dlp is in PATH or provide full path if needed
                ytdlp_args = shlex.split(cmd_string)
                
                # Add the paths argument to force output directory
                if '--paths' not in ytdlp_args and '-P' not in ytdlp_args:
                    ytdlp_args.extend(['--paths', downloads_dir])
                    
                ytdlp_args.append(url)
                
                ytdlp_path = shutil.which('yt-dlp') or 'yt-dlp'

                try:
                    process = subprocess.Popen(
                        [ytdlp_path] + ytdlp_args,
                        cwd=downloads_dir,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1 # Line buffered
                    )
                    
                    send_message(encode_message({
                        "status": "started",
                        "taskId": task_id,
                        "pid": process.pid,
                        "message": "Download started"
                    }))

                    for line in process.stdout:
                        # Send output immediately back to Chrome extension
                        send_message(encode_message({
                            "status": "progress",
                            "taskId": task_id,
                            "line": line.strip()
                        }))
                        
                    process.wait()
                    send_message(encode_message({
                        "status": "completed",
                        "taskId": task_id,
                        "code": process.returncode
                    }))
                    
                except Exception as e:
                    send_message(encode_message({"error": str(e), "taskId": task_id}))
                    
        except Exception as e:
            # Critical error in reading/writing
            sys.exit(1)

if __name__ == '__main__':
    main()
