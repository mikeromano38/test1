-- cube: fulfillment_daily (day x distribution_center)
SELECT
  FORMAT_DATE('%F', DATE(oi.created_at)) AS date,
  dc.name AS distribution_center,
  COUNT(DISTINCT oi.order_id) AS orders,
  COUNTIF(oi.shipped_at IS NOT NULL) AS shipped_count,
  ROUND(SUM(IF(oi.shipped_at IS NOT NULL, TIMESTAMP_DIFF(oi.shipped_at, oi.created_at, HOUR) / 24, 0)), 2) AS ship_days_total,
  COUNTIF(oi.delivered_at IS NOT NULL) AS delivered_count,
  ROUND(SUM(IF(oi.delivered_at IS NOT NULL, TIMESTAMP_DIFF(oi.delivered_at, oi.created_at, HOUR) / 24, 0)), 2) AS delivery_days_total
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.products` p ON p.id = oi.product_id
JOIN `bigquery-public-data.thelook_ecommerce.distribution_centers` dc ON dc.id = p.distribution_center_id
WHERE DATE(oi.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  AND DATE(oi.created_at) < CURRENT_DATE()
GROUP BY 1, 2
ORDER BY 1, 2
