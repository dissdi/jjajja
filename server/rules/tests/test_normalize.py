import pytest

from rules import InvalidUrl, Normalized, UnsupportedPlatform, normalize

VID = "jzE0Rcb2hY4"
CANON = f"https://www.youtube.com/watch?v={VID}"


@pytest.mark.parametrize("url", [
    f"https://www.youtube.com/shorts/{VID}",
    f"https://youtube.com/shorts/{VID}?si=AbCdEfGh12345678",
    f"https://m.youtube.com/shorts/{VID}?feature=share",
    f"https://youtu.be/{VID}",
    f"https://youtu.be/{VID}?si=xyz&t=3",
    f"https://www.youtube.com/watch?v={VID}",
    f"https://www.youtube.com/watch?app=desktop&v={VID}&feature=youtu.be&pp=abc",
    f"https://m.youtube.com/watch?v={VID}&list=PL123",
    f"https://www.youtube.com/embed/{VID}?autoplay=1",
    f"https://www.youtube.com/live/{VID}",
    f"https://music.youtube.com/watch?v={VID}",
    f"HTTPS://WWW.YOUTUBE.COM/shorts/{VID}",
    f"  https://youtube.com/shorts/{VID}?si=abc  \n",
    f"youtube.com/shorts/{VID}",
    f"youtu.be/{VID}",
    # share strings with surrounding text (KakaoTalk, YouTube app share sheet)
    f"이 영상 좀 보세요 https://youtube.com/shorts/{VID}?si=Q1w2E3r4 너무 웃겨요",
    f"고양이 다이빙 ㅋㅋ\nhttps://youtu.be/{VID}?si=abc영상 보세요",
    f"[유튜브] 짱귀여움 (https://youtube.com/shorts/{VID}?feature=share).",
    f"보세요: https://www.youtube.com/shorts/{VID}/",
])
def test_youtube_variants(url):
    assert normalize(url) == Normalized("youtube", VID, CANON)


def test_first_supported_url_wins():
    text = f"https://example.com/x 그리고 https://youtu.be/{VID}"
    assert normalize(text).video_id == VID


def test_id_with_dash_underscore():
    assert normalize("https://youtube.com/shorts/-dNgv_wk7A0").video_id == "-dNgv_wk7A0"


@pytest.mark.parametrize("text", [
    "", "   ", "안녕하세요 영상 보내드려요", "not a url",
    "https://www.youtube.com/", "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/watch?v=short", "https://youtu.be/",
    "https://www.youtube.com/playlist?list=PL123",
])
def test_invalid(text):
    with pytest.raises(InvalidUrl):
        normalize(text)


@pytest.mark.parametrize("text", [
    "https://www.tiktok.com/@user/video/7300000000000000000",
    "https://www.instagram.com/reel/Cxyz123/",
    "https://example.com/shorts/jzE0Rcb2hY4",
    "https://notyoutube.com/watch?v=jzE0Rcb2hY4",
    "https://youtube.com.evil.io/shorts/jzE0Rcb2hY4",
])
def test_unsupported(text):
    with pytest.raises(UnsupportedPlatform):
        normalize(text)
