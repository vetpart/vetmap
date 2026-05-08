(function () {
  const EARTH_RADIUS_KM = 6371.0088;

  function toRadians(value) {
    return value * Math.PI / 180;
  }

  function haversineKm(a, b) {
    const lat1 = toRadians(Number(a.lat));
    const lat2 = toRadians(Number(b.lat));
    const dlat = lat2 - lat1;
    const dlng = toRadians(Number(b.lng) - Number(a.lng));
    const h = Math.sin(dlat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  }

  function rowTieBreaker(row) {
    return `${row.name || ""}|${row.amap_id || ""}|${row.lng}|${row.lat}`;
  }

  function distanceMatrix(rows) {
    const distances = Array.from({ length: rows.length }, () => Array(rows.length).fill(0));
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const distance = haversineKm(rows[i], rows[j]);
        distances[i][j] = distance;
        distances[j][i] = distance;
      }
    }
    return distances;
  }

  function routeLength(route, distances) {
    let total = 0;
    for (let i = 0; i < route.length - 1; i += 1) {
      total += distances[route[i]][route[i + 1]];
    }
    return total;
  }

  function nearestRouteFrom(start, rows, distances) {
    const route = [start];
    const unvisited = new Set(rows.map((_, index) => index));
    unvisited.delete(start);
    while (unvisited.size) {
      const current = route[route.length - 1];
      let next = null;
      for (const candidate of unvisited) {
        if (
          next === null ||
          distances[current][candidate] < distances[current][next] ||
          (
            distances[current][candidate] === distances[current][next] &&
            rowTieBreaker(rows[candidate]) < rowTieBreaker(rows[next])
          )
        ) {
          next = candidate;
        }
      }
      route.push(next);
      unvisited.delete(next);
    }
    return route;
  }

  function twoOptFixedStart(route, distances, maxN = 120) {
    const n = route.length;
    if (n < 4 || n > maxN) return route;

    let best = route.slice();
    let bestLength = routeLength(best, distances);
    let improved = true;
    let passes = 0;
    while (improved && passes < 8) {
      improved = false;
      passes += 1;
      for (let i = 1; i < n - 2; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const candidate = best.slice(0, i)
            .concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
          const candidateLength = routeLength(candidate, distances);
          if (candidateLength + 1e-9 < bestLength) {
            best = candidate;
            bestLength = candidateLength;
            improved = true;
          }
        }
      }
    }
    return best;
  }

  function renumberRows(rows, routeId, routeName) {
    let cumulative = 0;
    return rows.map((row, index) => {
      const prev = index === 0 ? 0 : haversineKm(rows[index - 1], row);
      cumulative += prev;
      return {
        ...row,
        order: index + 1,
        prev_distance_km: Number(prev.toFixed(3)),
        cumulative_distance_km: Number(cumulative.toFixed(3)),
        route_id: routeId ?? row.route_id,
        route_name: routeName ?? row.route_name,
      };
    });
  }

  function reorderRowsFromStart(rows, startAmapId, options = {}) {
    if (!Array.isArray(rows) || rows.length <= 1) {
      return renumberRows(rows || [], options.routeId, options.routeName);
    }
    const start = rows.findIndex(row => row.amap_id === startAmapId);
    if (start < 0) return renumberRows(rows, options.routeId, options.routeName);

    const distances = distanceMatrix(rows);
    const nearest = nearestRouteFrom(start, rows, distances);
    const route = twoOptFixedStart(nearest, distances, 80);
    const ordered = route.map(index => rows[index]);
    return renumberRows(ordered, options.routeId, options.routeName);
  }

  function totalDistanceKm(rows) {
    if (!Array.isArray(rows) || rows.length <= 1) return 0;
    let total = 0;
    for (let i = 1; i < rows.length; i += 1) {
      total += haversineKm(rows[i - 1], rows[i]);
    }
    return Number(total.toFixed(3));
  }

  window.VetRouteTools = {
    haversineKm,
    reorderRowsFromStart,
    totalDistanceKm,
  };
}());
