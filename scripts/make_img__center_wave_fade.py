from PIL import Image


def map_range(
    value: float,
    in_min: float,
    in_max: float,
    out_min: float,
    out_max: float,
    clamp: bool = False,
) -> float:
    """Maps a number from one range to another, with optional clamping."""
    if in_min == in_max:
        raise ValueError("in_min and in_max cannot be equal.")

    # Perform linear mapping
    mapped = out_min + (value - in_min) * (out_max - out_min) / (in_max - in_min)

    if clamp:
        # Handle both ascending (0 to 100) and inverted (100 to 0) output ranges
        lower, upper = min(out_min, out_max), max(out_min, out_max)
        mapped = max(lower, min(mapped, upper))

    return mapped


def unit_circ_half_width(y):
    half_chord_len = (1 - y**2) ** (1 / 2)
    return -1 if isinstance(half_chord_len, complex) else half_chord_len


IMG_SIZE = 420
RADIUS = 200 / 210

if __name__ == "__main__":
    img = Image.new("RGBA", (IMG_SIZE, IMG_SIZE))
    width, height = img.size

    pixels = img.load()

    # 2. Loop through coordinates and set colors
    for ix in range(width):
        px = ix + 1 / 2
        x = map_range(px, 0, width, -1, 1, True)
        for iy in range(height):
            py = iy + 1 / 2
            y = map_range(py, 0, height, -1, 1, True)

            event_horizon = RADIUS * unit_circ_half_width(abs(y) / RADIUS)
            a = (
                map_range(abs(x), event_horizon, 1, 1, 0, True)
                if event_horizon >= 0
                else 0
            )

            pixels[ix, iy] = 0, 0, 0, round(255 * a)

    # 3. Save the modified image
    img.save("./images/center-wave-fade.png")
