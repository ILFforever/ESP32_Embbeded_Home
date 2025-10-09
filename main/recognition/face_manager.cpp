#include "face_manager.hpp"
#include <cJSON.h>
#include <sys/stat.h>
#include "esp_system.h"

static const char* TAG = "FaceManager";

namespace who {
namespace recognition {

FaceManager::FaceManager(const char* db_path,
                        const char* names_json_path,
                        HumanFaceFeat::model_type_t model_type,
                        float threshold,
                        int top_k)
    : m_names_json_path(names_json_path)
{
    // Create mutex for thread-safe operations
    m_mutex = xSemaphoreCreateMutex();
    if (!m_mutex) {
        ESP_LOGE(TAG, "Failed to create mutex");
    }

    // Create recognizer
    char* db_path_copy = strdup(db_path);
    m_recognizer = new HumanFaceRecognizer(db_path_copy, model_type, threshold, top_k);

    // Load face names from JSON
    load_names_from_json();

    // Sync names with database (remove deleted IDs)
    sync_with_database();
}

FaceManager::~FaceManager()
{
    delete m_recognizer;
    if (m_mutex) {
        vSemaphoreDelete(m_mutex);
    }
}

uint16_t FaceManager::enroll_face(const dl::image::img_t& img,
                                  const std::list<dl::detect::result_t>& detect_res,
                                  const std::string& name)
{
    if (xSemaphoreTake(m_mutex, portMAX_DELAY) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to take mutex");
        return 0;
    }

    // Get current number of faces before enrollment
    int prev_count = m_recognizer->get_num_feats();

    // Enroll face
    esp_err_t ret = m_recognizer->enroll(img, detect_res);
    if (ret != ESP_OK) {
        xSemaphoreGive(m_mutex);
        return 0;
    }

    // Get new face ID (should be prev_count + 1)
    uint16_t new_id = get_last_enrolled_id();

    // Generate name if not provided
    std::string face_name = name;
    if (face_name.empty()) {
        face_name = generate_default_name();
    }

    // Store face info
    FaceInfo info(face_name, get_current_timestamp());
    m_face_names[new_id] = info;

    // Save to JSON
    save_names_to_json();

    xSemaphoreGive(m_mutex);

    ESP_LOGI(TAG, "Enrolled face ID %d with name '%s'", new_id, face_name.c_str());
    return new_id;
}

std::vector<FaceRecognitionResult> FaceManager::recognize(const dl::image::img_t& img,
                                                          const std::list<dl::detect::result_t>& detect_res)
{
    if (xSemaphoreTake(m_mutex, portMAX_DELAY) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to take mutex");
        return {};
    }

    // Perform recognition
    auto results = m_recognizer->recognize(img, detect_res);

    // Convert to FaceRecognitionResult with names
    std::vector<FaceRecognitionResult> named_results;
    for (const auto& res : results) {
        std::string name = "Unknown";
        auto it = m_face_names.find(res.id);
        if (it != m_face_names.end()) {
            name = it->second.name;
        }
        named_results.emplace_back(res.id, name, res.similarity);
    }

    xSemaphoreGive(m_mutex);
    return named_results;
}

esp_err_t FaceManager::delete_face(uint16_t id)
{
    if (xSemaphoreTake(m_mutex, portMAX_DELAY) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to take mutex");
        return ESP_FAIL;
    }

    // Delete from database
    esp_err_t ret = m_recognizer->delete_feat(id);
    if (ret != ESP_OK) {
        xSemaphoreGive(m_mutex);
        return ret;
    }

    // Remove from name map
    auto it = m_face_names.find(id);
    if (it != m_face_names.end()) {
        ESP_LOGI(TAG, "Deleted face ID %d ('%s')", id, it->second.name.c_str());
        m_face_names.erase(it);
    } else {
        ESP_LOGI(TAG, "Deleted face ID %d", id);
    }

    // Save to JSON
    save_names_to_json();

    xSemaphoreGive(m_mutex);
    return ESP_OK;
}

esp_err_t FaceManager::delete_face_by_name(const std::string& name)
{
    if (xSemaphoreTake(m_mutex, portMAX_DELAY) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to take mutex");
        return ESP_FAIL;
    }

    // Find first face with this name
    uint16_t target_id = 0;
    for (const auto& pair : m_face_names) {
        if (pair.second.name == name) {
            target_id = pair.first;
            break;
        }
    }

    xSemaphoreGive(m_mutex);

    if (target_id == 0) {
        ESP_LOGW(TAG, "No face found with name '%s'", name.c_str());
        return ESP_FAIL;
    }

    return delete_face(target_id);
}

esp_err_t FaceManager::rename_face(uint16_t id, const std::string& new_name)
{
    if (xSemaphoreTake(m_mutex, portMAX_DELAY) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to take mutex");
        return ESP_FAIL;
    }

    auto it = m_face_names.find(id);
    if (it == m_face_names.end()) {
        ESP_LOGW(TAG, "Face ID %d not found", id);
        xSemaphoreGive(m_mutex);
        return ESP_FAIL;
    }

    std::string old_name = it->second.name;
    it->second.name = new_name;

    // Save to JSON
    save_names_to_json();

    xSemaphoreGive(m_mutex);

    ESP_LOGI(TAG, "Renamed face ID %d from '%s' to '%s'", id, old_name.c_str(), new_name.c_str());
    return ESP_OK;
}

std::string FaceManager::get_face_name(uint16_t id)
{
    if (xSemaphoreTake(m_mutex, portMAX_DELAY) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to take mutex");
        return "Unknown";
    }

    std::string name = "Unknown";
    auto it = m_face_names.find(id);
    if (it != m_face_names.end()) {
        name = it->second.name;
    }

    xSemaphoreGive(m_mutex);
    return name;
}

std::vector<std::tuple<uint16_t, std::string, std::string>> FaceManager::get_all_faces()
{
    if (xSemaphoreTake(m_mutex, portMAX_DELAY) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to take mutex");
        return {};
    }

    std::vector<std::tuple<uint16_t, std::string, std::string>> faces;
    for (const auto& pair : m_face_names) {
        faces.emplace_back(pair.first, pair.second.name, pair.second.enrolled_timestamp);
    }

    xSemaphoreGive(m_mutex);
    return faces;
}

esp_err_t FaceManager::clear_all_faces()
{
    if (xSemaphoreTake(m_mutex, portMAX_DELAY) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to take mutex");
        return ESP_FAIL;
    }

    // Clear database
    esp_err_t ret = m_recognizer->clear_all_feats();
    if (ret != ESP_OK) {
        xSemaphoreGive(m_mutex);
        return ret;
    }

    // Clear name map
    m_face_names.clear();

    // Save to JSON
    save_names_to_json();

    xSemaphoreGive(m_mutex);

    ESP_LOGI(TAG, "Cleared all faces");
    return ESP_OK;
}

int FaceManager::get_num_faces()
{
    return m_recognizer->get_num_feats();
}

// ============================================================
// Private Methods - JSON Persistence
// ============================================================

esp_err_t FaceManager::load_names_from_json()
{
    struct stat st;
    if (stat(m_names_json_path.c_str(), &st) != 0) {
        ESP_LOGI(TAG, "Names file not found, starting with empty database");
        return ESP_OK;
    }

    FILE* f = fopen(m_names_json_path.c_str(), "r");
    if (!f) {
        ESP_LOGE(TAG, "Failed to open names file");
        return ESP_FAIL;
    }

    // Read file content
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    char* buffer = (char*)malloc(size + 1);
    if (!buffer) {
        ESP_LOGE(TAG, "Failed to allocate buffer");
        fclose(f);
        return ESP_FAIL;
    }

    fread(buffer, 1, size, f);
    buffer[size] = '\0';
    fclose(f);

    // Parse JSON
    cJSON* root = cJSON_Parse(buffer);
    free(buffer);

    if (!root) {
        ESP_LOGE(TAG, "Failed to parse JSON: %s", cJSON_GetErrorPtr());
        return ESP_FAIL;
    }

    // Load face names
    m_face_names.clear();
    cJSON* item = NULL;
    cJSON_ArrayForEach(item, root) {
        if (!cJSON_IsObject(item)) continue;

        cJSON* id_json = cJSON_GetObjectItem(item, "id");
        cJSON* name_json = cJSON_GetObjectItem(item, "name");
        cJSON* timestamp_json = cJSON_GetObjectItem(item, "enrolled");

        if (id_json && name_json && timestamp_json) {
            uint16_t id = (uint16_t)cJSON_GetNumberValue(id_json);
            const char* name = cJSON_GetStringValue(name_json);
            const char* timestamp = cJSON_GetStringValue(timestamp_json);

            if (name && timestamp) {
                m_face_names[id] = FaceInfo(name, timestamp);
            }
        }
    }

    cJSON_Delete(root);
    ESP_LOGI(TAG, "Loaded %d face names from JSON", m_face_names.size());
    return ESP_OK;
}

esp_err_t FaceManager::save_names_to_json()
{
    cJSON* root = cJSON_CreateArray();
    if (!root) {
        ESP_LOGE(TAG, "Failed to create JSON array");
        return ESP_FAIL;
    }

    // Add all face names
    for (const auto& pair : m_face_names) {
        cJSON* item = cJSON_CreateObject();
        cJSON_AddNumberToObject(item, "id", pair.first);
        cJSON_AddStringToObject(item, "name", pair.second.name.c_str());
        cJSON_AddStringToObject(item, "enrolled", pair.second.enrolled_timestamp.c_str());
        cJSON_AddItemToArray(root, item);
    }

    // Convert to string
    char* json_str = cJSON_Print(root);
    cJSON_Delete(root);

    if (!json_str) {
        ESP_LOGE(TAG, "Failed to convert JSON to string");
        return ESP_FAIL;
    }

    // Write to file
    FILE* f = fopen(m_names_json_path.c_str(), "w");
    if (!f) {
        ESP_LOGE(TAG, "Failed to open names file for writing");
        free(json_str);
        return ESP_FAIL;
    }

    fprintf(f, "%s", json_str);
    fclose(f);
    free(json_str);

    ESP_LOGD(TAG, "Saved %d face names to JSON", m_face_names.size());
    return ESP_OK;
}

void FaceManager::sync_with_database()
{
    // Get current valid face count from database
    int db_count = m_recognizer->get_num_feats();

    // Remove any IDs from name map that no longer exist in database
    // Note: This is a simple heuristic - we assume IDs are sequential
    // A more robust approach would query the database for valid IDs
    std::vector<uint16_t> ids_to_remove;
    for (const auto& pair : m_face_names) {
        if (pair.first > db_count) {
            ids_to_remove.push_back(pair.first);
        }
    }

    for (uint16_t id : ids_to_remove) {
        ESP_LOGW(TAG, "Removing orphaned face name for ID %d", id);
        m_face_names.erase(id);
    }

    if (!ids_to_remove.empty()) {
        save_names_to_json();
    }
}

// ============================================================
// Private Methods - Helpers
// ============================================================

std::string FaceManager::generate_default_name()
{
    int count = m_recognizer->get_num_feats();
    char buffer[32];
    snprintf(buffer, sizeof(buffer), "Person_%d", count);
    return std::string(buffer);
}

std::string FaceManager::get_current_timestamp()
{
    // Get current time in seconds since boot
    // For a real timestamp, you'd need RTC or NTP
    int64_t uptime_ms = esp_timer_get_time() / 1000;
    char buffer[32];
    snprintf(buffer, sizeof(buffer), "%lld", uptime_ms);
    return std::string(buffer);
}

uint16_t FaceManager::get_last_enrolled_id()
{
    // The database auto-increments IDs, so last ID = num_feats
    return (uint16_t)m_recognizer->get_num_feats();
}

} // namespace recognition
} // namespace who
