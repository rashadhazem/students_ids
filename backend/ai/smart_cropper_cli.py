import sys
import os

# Ensure script dir is in python path
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

try:
    from image_processor import apply_edits, smart_crop_face

    if len(sys.argv) >= 3:
        input_path = sys.argv[1]
        output_path = sys.argv[2]

        def parse_float(val, default=0.0):
            try:
                return float(str(val).replace(',', '.').strip())
            except Exception:
                return default

        def parse_int(val, default=0):
            try:
                return int(float(str(val).replace(',', '.').strip()))
            except Exception:
                return default

        zoom = parse_float(sys.argv[3], 1.0) if len(sys.argv) > 3 else 1.0
        rotation = parse_int(sys.argv[4], 0) if len(sys.argv) > 4 else 0
        flip_h = str(sys.argv[5]).lower() in ("true", "1", "yes") if len(sys.argv) > 5 else False
        offset_x = parse_float(sys.argv[6], 0.0) if len(sys.argv) > 6 else 0.0
        offset_y = parse_float(sys.argv[7], 0.0) if len(sys.argv) > 7 else 0.0
        auto_crop = str(sys.argv[8]).lower() in ("true", "1", "yes") if len(sys.argv) > 8 else True

        with open(input_path, "rb") as f:
            raw = f.read()

        try:
            processed = apply_edits(
                raw,
                rotation=rotation,
                flip_h=flip_h,
                zoom=zoom,
                offset_x=offset_x,
                offset_y=offset_y,
                auto_crop=auto_crop,
                enforce_single_face=True
            )

            with open(output_path, "wb") as f:
                f.write(processed)
            print("OK")
        except ValueError as ve:
            sys.stderr.write(f"VALIDATION_ERROR: {ve}\n")
            sys.exit(2)
    elif len(sys.argv) == 2 and sys.argv[1] == "--test":
        print("YuNet face cropper ready")
    else:
        print("Usage: python smart_cropper_cli.py <input> <output> [zoom] [rot] [flip] [ox] [oy] [auto_crop]")
except Exception as e:
    import traceback
    sys.stderr.write(f"ERROR: {e}\n{traceback.format_exc()}\n")
    sys.exit(1)
