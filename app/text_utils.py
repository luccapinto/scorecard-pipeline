import re
import unicodedata


def clean_text(text: str) -> str:
    """
    Cleans text for fair substring/WER comparison:
    - Converts to lowercase.
    - Normalizes Unicode characters (removes accents/diacritics).
    - Removes punctuation.
    - Normalizes spacing.
    """
    if not text:
        return ""
    text = text.lower()
    # Remove accents/diacritics
    text = "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )
    # Replace punctuation with space to prevent words joining
    text = re.sub(r"[.,?!_#*()\[\]{}:;\-\"'/]", " ", text)
    # Remove extra whitespace
    text = " ".join(text.split())
    return text
