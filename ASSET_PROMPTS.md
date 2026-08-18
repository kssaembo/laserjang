# 레이저 장기 이미지·효과음·BGM 생성 프롬프트

## 공통 아트 디렉션

- 초등학교 고학년용 전략 보드게임
- 딥 네이비, 매트 블랙, 앰버 골드, 사이버 블루, 크림슨 레드
- 고급 3D 보드게임 소품, 굵고 명확한 실루엣
- 폭력적이거나 무서운 표현 없이 지적인 긴장감
- 글자, 숫자, 로고, 워터마크 없음

## 이미지

### `main-background.webp` · 메인 배경 · 1920×1080

> 초등학생용 미래 전략 보드게임 '레이저 장기'의 시네마틱 메인 배경. 어두운 딥 네이비의 거대한 미래형 경기장 중앙에 정교한 사각 격자 보드가 놓여 있고, 보드 위로 사이버 블루 레이저와 크림슨 레드 레이저가 여러 거울을 통해 직각으로 반사되며 교차한다. 중앙에는 왕을 상징하는 추상적인 금빛 홀로그램 왕관 실루엣. 앰버 골드 금속 테두리와 은은한 안개, 고급 두뇌 서바이벌 프로그램 분위기. 인물, 글자, 숫자, 실제 로고, 워터마크 없음. 화면 중앙과 하단에 UI를 배치할 수 있도록 여백 확보, 16:9, 1920×1080.

### `control-room-background.webp` · 교사 운영 페이지 · 1920×1080

> 미래형 게임 관제실 배경. 어두운 매트 블랙과 딥 네이비 공간, 벽면에 여러 경기장의 상태를 암시하는 작은 홀로그램 패널과 빛나는 격자 지도, 앰버 골드와 사이버 블루 포인트 조명. 화면 위에 실제 텍스트나 숫자는 없고 정보 패널을 올리기 쉬운 낮은 대비, 전문적이지만 초등학생에게 친근한 고급 게임 쇼 분위기, 인물 없음, 로고 없음, 16:9, 1920×1080.

### `game-board-background.webp` · 경기장 배경 · 1920×1080

> 정면에 가까운 약간의 탑뷰로 본 미래형 레이저 장기 경기장. 중앙은 UI 게임판을 올릴 수 있도록 비어 있고, 주변에 어두운 금속 프레임과 얇은 앰버 골드 회로, 왼쪽은 차가운 사이버 블루 에너지, 오른쪽은 선명한 크림슨 레드 에너지가 은은하게 빛난다. 과도한 장식 없이 전략 게임에 집중되는 구성, 글자·숫자·인물·로고 없음, 16:9, 1920×1080.

### `result-background.webp` · 결과 화면 · 1920×1080

> 미래 전략 게임 승리 결과 배경. 깊은 네이비 공간 중앙에서 금빛 왕관 형상의 홀로그램이 떠오르고, 가느다란 사이버 블루와 크림슨 레드 레이저 조각이 바깥으로 퍼지는 장면. 절제된 금빛 파티클과 승리의 광채, 폭발이나 무기 느낌 없이 지적이고 장엄한 분위기. 중앙에 결과 UI를 위한 어두운 여백, 글자·숫자·로고 없음, 16:9, 1920×1080.

### `piece-blue-*.png`, `piece-red-*.png` · 말 세트 · 각 512×512 투명 PNG

각 말은 반드시 한 장에 하나씩 생성합니다. 아래 `{말}`을 교체합니다.

> 초등학생용 미래 전략 보드게임의 {말} 말 하나. 단단한 금속과 반투명 에너지 크리스털이 결합된 고급 3D 보드게임 피규어. {청색은 사이버 블루 빛과 은회색 금속 / 적색은 크림슨 레드 빛과 흑철 금속}, 거울면은 밝은 크림색 반사판으로 방향이 즉시 구분되는 굵은 실루엣. 작은 사각 받침 포함. 정면보다 약간 높은 3/4 시점, 중앙 배치, 투명 배경, 글자·숫자·로고·워터마크 없음, 512×512 PNG.

말별 형태 지시:

- 레이저: 움직이지 않는 소형 미래형 레이저 포탑, 한쪽 발사구가 명확함
- 스플리터: 마름모꼴 투명 프리즘, 직진 투과와 직각 반사를 동시에 상징
- 왕: 금빛 왕관과 보석 코어, 어느 면도 보호되지 않은 형태
- 세모기사: 삼각기둥, 한쪽 대각 거울면이 명확함
- 네모기사: 사각기둥, 한쪽 대각 거울면이 명확함

### `laser-warning.png` · 왕 피격 경고 · 1200×400 투명 PNG

> 미래 전략 게임의 왕 피격 경고 장식. 중앙의 금빛 왕관 실루엣에 얇은 붉은 레이저 균열이 지나가고 양옆으로 절제된 크림슨 경고 프레임이 펼쳐진다. 폭력적인 표현 없이 긴박한 게임 종료를 전달, 글자·숫자·로고 없음, 투명 배경 PNG, 1200×400.

## 효과음

효과음은 모두 무음 여백 없이 생성하며 WAV 또는 고음질 MP3로 저장합니다.

### `click.mp3` · 0.12초

> Clean futuristic UI click, short tactile glass-and-metal tick, subtle cyber blue sparkle, premium strategy board game interface, no reverb tail, no voice, 0.12 seconds.

### `piece-select.mp3` · 0.25초

> Futuristic board game piece selected, compact crystalline pulse with a soft metallic lock, intelligent and precise, child-friendly, no voice, no explosion, 0.25 seconds.

### `piece-move.mp3` · 0.35초

> Heavy premium board game piece sliding exactly one square on a metal-glass board, short low mechanical glide ending in a satisfying magnetic lock, no voice, 0.35 seconds.

### `piece-rotate.mp3` · 0.4초

> Small futuristic prism rotating ninety degrees, two-step mechanical turn with a bright glass shimmer at the end, precise strategy game sound, no voice, 0.4 seconds.

### `laser-fire.mp3` · 0.9초

> Clean sci-fi laser charging for a split second then firing across a glass board, sharp energetic beam with a controlled electronic tail, exciting but not aggressive, child-friendly, no explosion, no voice, 0.9 seconds.

### `laser-reflect.mp3` · 0.18초

> Tiny bright laser beam reflection from a crystal mirror, crisp high-frequency ping with a fast directional whoosh, no voice, 0.18 seconds.

### `splitter.mp3` · 0.35초

> Laser beam splitting into two paths through a crystal prism, one straight tone dividing into two sparkling stereo tones, futuristic and clear, no voice, 0.35 seconds.

### `piece-destroy.mp3` · 0.65초

> Futuristic board game piece deactivating after a laser hit, compact energy crackle and low metallic dissolve, no violence, no explosion, child-friendly, no voice, 0.65 seconds.

### `king-hit.mp3` · 1.4초

> Strategy game king eliminated, deep resonant impact followed by a descending glass-energy tone and brief dramatic silence, prestigious game show feeling, nonviolent, no voice, 1.4 seconds.

### `victory.mp3` · 3초

> Short cerebral strategy victory stinger, four ascending brass-synth and crystalline notes, amber gold triumph, premium television game show mood, energetic but not childish, no voice, clean ending, 3 seconds.

### `result-sent.mp3` · 0.8초

> Successful match result transmission, warm digital confirmation pulse followed by two bright ascending notes, reliable and satisfying, no voice, 0.8 seconds.

## BGM

### `lobby-bgm.mp3` · 메인 및 대기 화면 · 2분 이상, 루프

> Instrumental background music for an elementary classroom strategy game lobby. Premium cerebral game show atmosphere, 104 BPM, deep navy synth pads, restrained electronic pulse, soft ticking percussion, amber-gold bell accents, subtle sense of anticipation, sophisticated and child-friendly, no vocals, no spoken words, no dramatic climax, seamless loop, clean mix that stays behind classroom voices.

### `game-bgm.mp3` · 경기 중 · 3분 이상, 루프

> Instrumental tactical strategy game background music, 112 BPM, precise electronic pulse, low restrained synth bass, glassy arpeggios suggesting laser reflections, subtle tension that slowly evolves without a large climax, premium brain survival show mood, exciting but never frightening, child-friendly, no vocals, no spoken words, seamless loop, enough space for sound effects and classroom conversation.

### `result-bgm.mp3` · 결과 전광판 · 90초 이상, 루프

> Instrumental results scoreboard music for a premium classroom strategy tournament, 96 BPM, confident amber-gold synth brass, elegant electronic rhythm, celebratory but restrained, intelligent competition atmosphere, child-friendly, no vocals, no spoken words, seamless loop.

## 음원 적용 권장값

- 로비 BGM: 기본 볼륨 22%
- 게임 BGM: 기본 볼륨 18%
- 결과 BGM: 기본 볼륨 24%
- 효과음: 기본 볼륨 65%
- `laser-fire` 중 BGM을 약 25%만큼 순간적으로 낮추고 1초 안에 복귀
- 모바일 브라우저 자동재생 제한을 고려해 첫 번째 사용자 터치 이후 재생 시작
