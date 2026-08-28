#pragma once

#include <cstddef>
#include <cstdint>

namespace ima_adpcm {

size_t encoded_size(size_t sample_count);

// Encode one independently decodable mono PCM16 block. The step index is
// retained between blocks for quality, while each packet carries its initial
// predictor/index so packet loss cannot corrupt later audio.
bool encode_block(const int16_t *samples,
                  size_t sample_count,
                  uint8_t *output,
                  size_t output_capacity,
                  size_t *output_size,
                  int *step_index,
                  int16_t *initial_predictor,
                  uint8_t *initial_step_index);

} // namespace ima_adpcm
