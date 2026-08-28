#include "ima_adpcm.hpp"

#include <algorithm>
#include <cstring>

namespace ima_adpcm {

static constexpr int16_t STEP_TABLE[89] = {
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31,
    34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130,
    143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449,
    494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411,
    1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026,
    4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
    11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
    27086, 29794, 32767};

static constexpr int8_t INDEX_TABLE[16] = {
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8};

size_t encoded_size(size_t sample_count)
{
    return sample_count <= 1 ? 0 : (sample_count - 1 + 1) / 2;
}

bool encode_block(const int16_t *samples,
                  size_t sample_count,
                  uint8_t *output,
                  size_t output_capacity,
                  size_t *output_size,
                  int *step_index,
                  int16_t *initial_predictor,
                  uint8_t *initial_step_index)
{
    if (samples == nullptr || sample_count == 0 || output_size == nullptr ||
        step_index == nullptr || initial_predictor == nullptr ||
        initial_step_index == nullptr)
    {
        return false;
    }

    const size_t required = encoded_size(sample_count);
    if (required > output_capacity || (required > 0 && output == nullptr))
    {
        return false;
    }

    int index = std::clamp(*step_index, 0, 88);
    int predictor = samples[0];
    *initial_predictor = static_cast<int16_t>(predictor);
    *initial_step_index = static_cast<uint8_t>(index);
    *output_size = required;

    if (required > 0)
    {
        std::memset(output, 0, required);
    }

    for (size_t sample_index = 1; sample_index < sample_count; ++sample_index)
    {
        const int step = STEP_TABLE[index];
        int difference = static_cast<int>(samples[sample_index]) - predictor;
        uint8_t code = 0;

        if (difference < 0)
        {
            code = 8;
            difference = -difference;
        }

        int delta = step >> 3;
        if (difference >= step)
        {
            code |= 4;
            difference -= step;
            delta += step;
        }
        if (difference >= (step >> 1))
        {
            code |= 2;
            difference -= step >> 1;
            delta += step >> 1;
        }
        if (difference >= (step >> 2))
        {
            code |= 1;
            delta += step >> 2;
        }

        predictor += (code & 8) ? -delta : delta;
        predictor = std::clamp(predictor, -32768, 32767);
        index = std::clamp(index + INDEX_TABLE[code & 0x0f], 0, 88);

        const size_t encoded_index = sample_index - 1;
        if ((encoded_index & 1U) == 0)
        {
            output[encoded_index / 2] = code & 0x0f;
        }
        else
        {
            output[encoded_index / 2] |= static_cast<uint8_t>((code & 0x0f) << 4);
        }
    }

    *step_index = index;
    return true;
}

} // namespace ima_adpcm
