-- cube: inventory_monthly (month-end stock levels x distribution_center x category)
WITH months AS (
  SELECT m AS month_start, LAST_DAY(m, MONTH) AS month_end
  FROM UNNEST(GENERATE_DATE_ARRAY(DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH), MONTH),
                                  DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)) AS m
)
SELECT
  FORMAT_DATE('%F', months.month_start) AS date,
  dc.name AS distribution_center,
  ii.product_category AS category,
  COUNT(*) AS stock_on_hand,
  ROUND(SUM(ii.cost), 2) AS inventory_cost
FROM months
JOIN `bigquery-public-data.thelook_ecommerce.inventory_items` ii
  ON DATE(ii.created_at) <= LEAST(months.month_end, DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
 AND (ii.sold_at IS NULL OR DATE(ii.sold_at) > LEAST(months.month_end, DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)))
JOIN `bigquery-public-data.thelook_ecommerce.distribution_centers` dc
  ON dc.id = ii.product_distribution_center_id
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
