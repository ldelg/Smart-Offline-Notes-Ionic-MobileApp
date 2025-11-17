# save as test_transcribe.py
import requests
from pathlib import Path

API_URL = "http://127.0.0.1:8000/transcribe"
FILE = Path(r"C:\Users\me\Desktop\Recorded-test.mp3")

with FILE.open("rb") as audio:
    response = requests.post(
        API_URL,
        files={"file": (FILE.name, audio, "audio/mpeg")},
    )

print(response.status_code)
print(response.json())