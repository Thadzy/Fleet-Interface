#include <cstdlib>
#include <iostream>

#include <drogon/HttpClient.h>
#include <drogon/drogon.h>
#include <json/json.h>

using namespace drogon;

static Json::Value MakeSampleRequestData() {
  Json::Value data;

  // Distance matrix
  Json::Value matrix(Json::arrayValue);
  std::vector<std::vector<int>> distance_matrix = {
      {0, 548, 776, 696, 582, 274, 502, 194, 308, 194, 536, 502, 388, 354, 468, 776, 662},
      {548, 0, 684, 308, 194, 502, 730, 354, 696, 742, 1084, 594, 480, 674, 1016, 868, 1210},
      {776, 684, 0, 992, 878, 502, 274, 810, 468, 742, 400, 1278, 1164, 1130, 788, 1552, 754},
      {696, 308, 992, 0, 114, 650, 878, 502, 844, 890, 1232, 514, 628, 822, 1164, 560, 1358},
      {582, 194, 878, 114, 0, 536, 764, 388, 730, 776, 1118, 400, 514, 708, 1050, 674, 1244},
      {274, 502, 502, 650, 536, 0, 228, 308, 194, 240, 582, 776, 662, 628, 514, 1050, 708},
      {502, 730, 274, 878, 764, 228, 0, 536, 194, 468, 354, 1004, 890, 856, 514, 1278, 480},
      {194, 354, 810, 502, 388, 308, 536, 0, 342, 388, 730, 468, 354, 320, 662, 742, 856},
      {308, 696, 468, 844, 730, 194, 194, 342, 0, 274, 388, 810, 696, 662, 320, 1084, 514},
      {194, 742, 742, 890, 776, 240, 468, 388, 274, 0, 342, 536, 422, 388, 274, 810, 468},
      {536, 1084, 400, 1232, 1118, 582, 354, 730, 388, 342, 0, 878, 764, 730, 388, 1152, 354},
      {502, 594, 1278, 514, 400, 776, 1004, 468, 810, 536, 878, 0, 114, 308, 650, 274, 844},
      {388, 480, 1164, 628, 514, 662, 890, 354, 696, 422, 764, 114, 0, 194, 536, 388, 730},
      {354, 674, 1130, 822, 708, 628, 856, 320, 662, 388, 730, 308, 194, 0, 342, 422, 536},
      {468, 1016, 788, 1164, 1050, 514, 514, 662, 320, 274, 388, 650, 536, 342, 0, 764, 194},
      {776, 868, 1552, 560, 674, 1050, 1278, 742, 1084, 810, 1152, 274, 388, 422, 764, 0, 798},
      {662, 1210, 754, 1358, 1244, 708, 480, 856, 514, 468, 354, 844, 730, 536, 194, 798, 0},
  };

  for (const auto& row : distance_matrix) {
    Json::Value json_row(Json::arrayValue);
    for (int val : row) {
      json_row.append(val);
    }
    matrix.append(json_row);
  }
  data["distance_matrix"] = matrix;

  // Pickups and deliveries
  Json::Value pickups_deliveries(Json::arrayValue);
  std::vector<std::vector<int>> pd_pairs = {
      {1, 6},
      {2, 10},
      {4, 3},
      {5, 9},
      {7, 8},
      {15, 11},
      {13, 12},
      {16, 14},
  };

  for (const auto& pair : pd_pairs) {
    Json::Value json_pair(Json::arrayValue);
    json_pair.append(pair[0]);
    json_pair.append(pair[1]);
    pickups_deliveries.append(json_pair);
  }
  data["pickups_deliveries"] = pickups_deliveries;

  // Other parameters
  data["num_vehicles"] = 4;
  data["depot"] = 0;
  data["vehicle_max_distance"] = 3000;
  data["global_span_cost_coefficient"] = 100;

  return data;
}

int main(int argc, char* argv[]) {
  // Default server address
  std::string server_url = "http://127.0.0.1:7779";

  // Allow override via command line argument
  if (argc > 1) {
    server_url = argv[1];
  }

  std::cout << "Testing VRP API at: " << server_url << "/solve" << std::endl;

  // Prepare request data
  Json::Value requestData = MakeSampleRequestData();

  // Create HTTP client
  auto client = HttpClient::newHttpClient(server_url);

  // Create request
  auto req = HttpRequest::newHttpJsonRequest(requestData);
  req->setMethod(Post);
  req->setPath("/solve");

  // Send request and wait for response
  bool success = false;
  client->sendRequest(
      req,
      [&success](ReqResult result, const HttpResponsePtr& response) {
        if (result != ReqResult::Ok) {
          std::cerr << "Request failed: " << static_cast<int>(result) << std::endl;
          app().quit();
          return;
        }

        if (response->getStatusCode() != k200OK) {
          std::cerr << "HTTP error: " << response->getStatusCode() << std::endl;
          std::cerr << "Response body: " << response->getBody() << std::endl;
          app().quit();
          return;
        }

        // Parse response
        auto json = response->getJsonObject();
        if (!json) {
          std::cerr << "Failed to parse JSON response" << std::endl;
          app().quit();
          return;
        }

        // Check if solution is feasible
        if (!(*json)["feasible"].asBool()) {
          std::cerr << "Solve failed: " << (*json)["summary"].asString() << std::endl;
          app().quit();
          return;
        }

        // Print results
        std::cout << "\n=== VRP Solution ===" << std::endl;
        std::cout << "Feasible: " << ((*json)["feasible"].asBool() ? "Yes" : "No") << std::endl;
        std::cout << "Total Distance: " << (*json)["total_distance"].asInt64() << "m" << std::endl;
        std::cout << "Wall Time: " << (*json)["wall_time_ms"].asInt64() << "ms" << std::endl;
        std::cout << "\nRoutes:" << std::endl;

        const auto& routes = (*json)["routes"];
        for (const auto& route : routes) {
          std::cout << "  Vehicle " << route["vehicle_id"].asInt() << ": ";

          const auto& nodes = route["nodes"];
          for (Json::ArrayIndex i = 0; i < nodes.size(); ++i) {
            std::cout << nodes[i].asInt();
            if (i + 1 < nodes.size()) {
              std::cout << " -> ";
            }
          }
          std::cout << " (Distance: " << route["distance"].asInt64() << "m)" << std::endl;
        }

        std::cout << "\nSummary:\n" << (*json)["summary"].asString() << std::endl;

        success = true;
        app().quit();
      });

  // Run the event loop
  app().run();

  return success ? EXIT_SUCCESS : EXIT_FAILURE;
}
