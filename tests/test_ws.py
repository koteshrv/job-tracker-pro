import asyncio
import websockets
import json
import requests

async def test_ws():
    print("Connecting to ws...")
    try:
        async with websockets.connect('ws://127.0.0.1:8000/api/ws/logs') as websocket:
            print("Connected!")
            
            # Trigger a scrape in the background
            print("Triggering scrape...")
            r = requests.post("http://localhost:8000/api/run-scraper")
            print("Scrape trigger response:", r.status_code)

            # Wait for logs
            while True:
                msg = await websocket.recv()
                print("LOG RECEIVED:", msg)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(test_ws())
