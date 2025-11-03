#!/usr/bin/env python3
"""
Convert binary file (like MP3) to C array header file
Usage: python bin2hex.py doorbell.mp3 doorbell_audio.h
"""

import sys
import os

def bin2hex(input_file, output_file):
    with open(input_file, 'rb') as f:
        data = f.read()

    filename = os.path.basename(input_file)
    varname = os.path.splitext(filename)[0].replace('-', '_').replace(' ', '_')

    with open(output_file, 'w') as f:
        f.write(f"// Auto-generated from {filename}\n")
        f.write(f"// Size: {len(data)} bytes\n\n")
        f.write(f"#ifndef {varname.upper()}_H\n")
        f.write(f"#define {varname.upper()}_H\n\n")
        f.write(f"const unsigned int {varname}_len = {len(data)};\n")
        f.write(f"const unsigned char {varname}[] PROGMEM = {{\n")

        for i in range(0, len(data), 16):
            chunk = data[i:i+16]
            hex_str = ', '.join(f'0x{b:02x}' for b in chunk)
            f.write(f"  {hex_str},\n")

        f.write("};\n\n")
        f.write(f"#endif // {varname.upper()}_H\n")

    print(f"Created {output_file}")
    print(f"Variable: {varname}")
    print(f"Size: {len(data)} bytes")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python bin2hex.py input.mp3 output.h")
        sys.exit(1)

    bin2hex(sys.argv[1], sys.argv[2])
