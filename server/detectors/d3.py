"""D3 (ICCV'25, MIT) — training-free temporal detector. https://github.com/Zig-HS/D3

Re-implemented from the reference code (models/D3_model.py, data/datasets.py) without the
repo's hard-coded `.cuda()`:
  frames: 16 consecutive frames @ 8fps -> 224x224, ImageNet mean/std, BGR channel order as
          in the reference (cv2.imread). We center-square-crop first (vertical shorts)
          instead of the reference's 10% border crop.
  encoder: XCLIPVisionModel("microsoft/xclip-base-patch16").pooler_output per frame
  raw:  std( diff( ||e_t+1 - e_t||_2 ) )   (second-order L2 distance std; larger = more AI,
        see catalog 1-1 A1: eval.py computes AP(1 - y_true, y_pred) with real=1)
Raw is not a probability -> calibrate() with weights.yaml a,b (provisional until Platt fit).
"""
from __future__ import annotations

import threading

import numpy as np

from .base import Detector, DetectorResult, MediaBundle, band

_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class D3Detector(Detector):
    id = "d3"
    version = "xclip16-l2-v1"

    def load(self) -> None:
        import torch
        from transformers import XCLIPVisionModel

        name = self.cfg.get("encoder", "microsoft/xclip-base-patch16")
        self._torch = torch
        self.model = XCLIPVisionModel.from_pretrained(name).to(self.device).eval()
        self._lock = threading.Lock()

    def _tensor(self, paths):
        from PIL import Image
        arr = []
        for p in paths:
            im = Image.open(p).convert("RGB").resize((224, 224), Image.BICUBIC)
            a = np.asarray(im, dtype=np.float32)[:, :, ::-1] / 255.0  # RGB -> BGR (reference)
            arr.append(((a - _MEAN) / _STD).transpose(2, 0, 1))
        return self._torch.from_numpy(np.stack(arr)).to(self.device)

    def infer(self, media: MediaBundle) -> DetectorResult:
        torch = self._torch
        want = int(self.cfg.get("frames", 16))
        frames = media.clip_frames
        if len(frames) < 8:
            return DetectorResult(None, "unavailable", "영상이 너무 짧아 움직임은 확인하지 못했어요",
                                  {"n_frames": len(frames)})
        frames = frames[: (want if len(frames) >= want else 8)]
        with self._lock, torch.inference_mode():
            x = self._tensor(frames)
            emb = self.model(pixel_values=x).pooler_output.float()  # [T, 768]
            d1 = torch.linalg.vector_norm(emb[1:] - emb[:-1], ord=2, dim=-1)
            d2 = d1[1:] - d1[:-1]
            raw = float(torch.std(d2).item())
        s = self.calibrate(raw)
        return DetectorResult(
            score=s, status="ok",
            evidence_ko=band(s, "화면 움직임이 AI로 만든 영상과 비슷해요",
                             "화면 움직임만으로는 판단하기 어려워요",
                             "화면 움직임에서 AI 흔적은 찾지 못했어요"),
            raw={"d2_std": raw, "n_frames": len(frames)})
