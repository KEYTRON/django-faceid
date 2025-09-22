import json
import random
from channels.generic.websocket import AsyncWebsocketConsumer

# Челлендж: последовательность рандомных действий, которые сложно воспроизвести реплеем
STEPS = [
    {"type": "yaw", "dir": "LEFT",  "min": 15},   # поверни голову влево >= 15°
    {"type": "yaw", "dir": "RIGHT", "min": 15},
    {"type": "pitch", "dir": "UP",  "min": 10},   # подними подбородок
    {"type": "blink", "count": 1},                # моргни
]


class LivenessConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        await self.accept()
        # Перемешиваем и отправляем сценарий
        plan = random.sample(STEPS, k=len(STEPS))
        await self.send_json({"kind": "challenge_plan", "plan": plan, "timeout_s": 25})
        self.index = 0

    async def receive(self, text_data=None, bytes_data=None):
        """
        Клиент присылает метрики:
        { kind:"metrics", yaw:..., pitch:..., rolled:..., blink:true/false, ts:... }
        """
        try:
            data = json.loads(text_data or "{}")
        except Exception:
            return

        if data.get("kind") != "metrics":
            return

        if self.index >= len(STEPS):
            await self.send_json({"kind": "done", "passed": True})
            return

        step = STEPS[self.index]
        passed = False

        if step["type"] == "yaw":
            if step["dir"] == "LEFT" and data.get("yaw", 0) <= -step["min"]:
                passed = True
            if step["dir"] == "RIGHT" and data.get("yaw", 0) >= step["min"]:
                passed = True

        if step["type"] == "pitch":
            if step["dir"] == "UP" and data.get("pitch", 0) <= -step["min"]:
                passed = True
            if step["dir"] == "DOWN" and data.get("pitch", 0) >= step["min"]:
                passed = True

        if step["type"] == "blink" and data.get("blink", False):
            passed = True

        await self.send_json({"kind": "step", "index": self.index, "passed": passed})

        if passed:
            self.index += 1
            if self.index >= len(STEPS):
                await self.send_json({"kind": "done", "passed": True})

    async def send_json(self, payload):
        await self.send(text_data=json.dumps(payload))
