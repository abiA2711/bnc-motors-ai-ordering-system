const FUZZY_THRESHOLD = 0.55;
const MAX_FUZZY_SUGGESTIONS = 3;
const MAX_COMPARE_LENGTH = 120;

const normalizeName = (value) => {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
};

const levenshtein = (left, right) => {
  if (left === right) {
    return 0;
  }

  if (left.length > MAX_COMPARE_LENGTH || right.length > MAX_COMPARE_LENGTH) {
    return Math.max(left.length, right.length);
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];

    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost
      );
    }

    previous = current;
  }

  return previous[right.length];
};

const similarity = (left, right) => {
  const longest = Math.max(left.length, right.length);

  if (longest === 0) {
    return 0;
  }

  return 1 - levenshtein(left, right) / longest;
};

const formatScore = (value) => {
  const bounded = Math.min(0.89, Math.max(0, value));
  return bounded.toFixed(4);
};

const suggestion = (product, matchScore, matchMethod, matchReason) => {
  return {
    productId: String(product.id),
    matchScore,
    matchMethod,
    matchReason
  };
};

const matchLine = (item, products) => {
  const catalog = Array.isArray(products) ? products : [];
  const sku = item && item.sku ? String(item.sku).trim().toLowerCase() : "";
  const normalizedItemName = normalizeName(item && item.product_name);
  const skuWasProvided = sku.length > 0;

  if (skuWasProvided) {
    const exact = catalog.find((product) => String(product.sku || "").trim().toLowerCase() === sku);

    if (exact) {
      return [
        suggestion(
          exact,
          "1.0000",
          "exact_sku",
          "Exact catalog SKU match. Suggested only; review is required before an order is created."
        )
      ];
    }
  }

  const normalized = catalog.find((product) => normalizeName(product.name) === normalizedItemName && normalizedItemName);

  if (normalized) {
    const reason = skuWasProvided
      ? "The extracted SKU was not in the catalog. The normalized product name matches a catalog name. Suggested only; review is required."
      : "Normalized product name matches a catalog name. Suggested only; review is required.";

    return [
      suggestion(normalized, "0.9000", "normalized_name", reason)
    ];
  }

  const fuzzy = catalog
    .map((product) => {
      return {
        product,
        score: similarity(normalizedItemName, normalizeName(product.name))
      };
    })
    .filter((entry) => entry.score >= FUZZY_THRESHOLD)
    .sort((left, right) => right.score - left.score || String(left.product.id).localeCompare(String(right.product.id)))
    .slice(0, MAX_FUZZY_SUGGESTIONS);

  return fuzzy.map((entry) => {
    const reason = skuWasProvided
      ? "The extracted SKU was not in the catalog. The product name is only similar to a catalog product. This is a suggestion, not an approval."
      : "The product name is only similar to a catalog product. This is a suggestion, not an approval.";

    return suggestion(entry.product, formatScore(entry.score), "fuzzy_name", reason);
  });
};

const matchItems = (items, products) => {
  return items.map((item) => {
    return {
      ...item,
      matches: matchLine(item, products)
    };
  });
};

module.exports = {
  matchLine,
  matchItems,
  normalizeName
};
