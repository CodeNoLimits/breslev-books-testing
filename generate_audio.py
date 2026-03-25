#!/usr/bin/env python3
"""
ElevenLabs Audio Generator — Esther Ifrah Breslev Books
Voice ID: I4OcRsHEsIgu4GG7xNQH (cloned voice of Esther Ifrah)
Model: eleven_multilingual_v2
"""
import requests
import os
import sys

API_KEY = "sk_0be20b51684b8b30dcaa67582077fa4ec8e9e0d1e5fea89b"
VOICE_ID = "I4OcRsHEsIgu4GG7xNQH"
MODEL = "eleven_multilingual_v2"

VOICE_SETTINGS = {
    "stability": 0.55,
    "similarity_boost": 0.80,
    "style": 0.20,
    "use_speaker_boost": True
}

def generate_audio(text, output_path):
    """Generate audio from text using Esther's cloned voice."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    data = {
        "text": text,
        "model_id": MODEL,
        "voice_settings": VOICE_SETTINGS
    }

    response = requests.post(url, json=data, headers=headers)
    if response.status_code == 200:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(response.content)
        print(f"✅ Generated: {output_path} ({len(response.content)} bytes)")
        return True
    else:
        print(f"❌ Error {response.status_code}: {response.text[:200]}")
        return False


if __name__ == "__main__":
    project_dir = os.path.dirname(os.path.abspath(__file__))

    texts = {
        "welcome": "Bienvenue sur la boutique officielle des livres Breslev. Découvrez la sagesse de Rabbi Nachman.",
        "welcome-full": "Chalom et bienvenue sur mon site. Je suis Esther Ifrah, et je suis heureuse de vous accueillir dans cet espace dédié aux enseignements de Rabbi Nachman de Breslev. Vous trouverez ici mes traductions, mes cours audio, et bien sûr, mes livres. Bonne découverte et Na Nach Nachma Nachman MeOuman.",
        "books": "Découvrez ma collection de livres traduits en français. Chaque ouvrage est le fruit de nombreuses années de travail et d'amour pour les enseignements de Rabbi Nachman.",
        "courses": "Bienvenue dans la section cours. Ici, vous trouverez mes enseignements audio sur le Likoutey Moharan. Installez-vous confortablement et laissez-vous guider."
    }

    target = sys.argv[1] if len(sys.argv) > 1 else "welcome"

    if target == "all":
        for name, text in texts.items():
            output = os.path.join(project_dir, "assets", "audios", f"esther-{name}.mp3")
            generate_audio(text, output)
    elif target in texts:
        output = os.path.join(project_dir, "assets", "audios", f"esther-{target}.mp3")
        generate_audio(texts[target], output)
    else:
        print(f"Usage: python3 generate_audio.py [welcome|books|courses|all]")
        print(f"Available: {', '.join(texts.keys())}")
