"""Community Forensics (CVPR'25, MIT) ViT-S/16 224 fake-image detector, applied per frame.
https://github.com/JeongsooP/Community-Forensics  weights: HF OwensLab/commfor-model-224

Reference preprocessing (models.py ViTClassifier.preprocess_input, input_size=224):
  Resize(256) -> CenterCrop(224) -> ToTensor -> ImageNet Normalize; logit -> sigmoid.
We build the timm backbone without downloading ImageNet weights and load the HF safetensors
(keys `vit.*`). Video score = mean (or top-25% mean) over uniformly sampled frames.
"""
from __future__ import annotations

import threading

import numpy as np

from .base import Detector, DetectorResult, MediaBundle, band


class CommForDetector(Detector):
    id = "commfor_224"
    version = "commfor-224-v1"

    def load(self) -> None:
        import timm
        import torch
        from huggingface_hub import hf_hub_download
        from safetensors.torch import load_file
        from torchvision import transforms

        repo = self.cfg.get("hf_repo", "OwensLab/commfor-model-224")
        path = hf_hub_download(repo, "model.safetensors")
        sd = {k[4:]: v for k, v in load_file(path).items() if k.startswith("vit.")}
        m = timm.create_model("vit_small_patch16_224", pretrained=False, num_classes=1)
        m.load_state_dict(sd, strict=True)
        self._torch = torch
        self.model = m.to(self.device).eval()
        self.tf = transforms.Compose([
            transforms.Resize(256), transforms.CenterCrop(224), transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        self._lock = threading.Lock()

    def infer(self, media: MediaBundle) -> DetectorResult:
        from PIL import Image
        torch = self._torch
        frames = media.frames[: int(self.cfg.get("frames", 16))]
        if not frames:
            return DetectorResult(None, "unavailable", "영상에서 장면을 꺼내지 못했어요", {})
        with self._lock, torch.inference_mode():
            x = torch.stack([self.tf(Image.open(p).convert("RGB")) for p in frames]).to(self.device)
            probs = torch.sigmoid(self.model(x).float().squeeze(-1)).cpu().numpy()
        mean = float(np.mean(probs))
        k = max(1, int(np.ceil(len(probs) * 0.25)))
        top25 = float(np.mean(np.sort(probs)[-k:]))
        raw = top25 if self.cfg.get("aggregate") == "top25" else mean
        s = self.calibrate(raw)
        return DetectorResult(
            score=s, status="ok",
            evidence_ko=band(s, "화면 속 장면이 AI로 그린 그림과 비슷해요",
                             "화면 속 장면만으로는 판단하기 어려워요",
                             "화면 속 장면에서 AI 흔적은 찾지 못했어요"),
            raw={"mean": mean, "top25": top25, "per_frame": [round(float(p), 4) for p in probs]})
