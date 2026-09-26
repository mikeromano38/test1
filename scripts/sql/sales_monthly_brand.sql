-- cube: sales_monthly_brand (month x brand[top 40 + Other] x department)
WITH top_brands AS (
  SELECT p.brand
  FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
  JOIN `bigquery-public-data.thelook_ecommerce.products` p ON p.id = oi.product_id
  WHERE DATE(oi.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1 ORDER BY SUM(oi.sale_price) DESC LIMIT 40
)
SELECT
  FORMAT_DATE('%F', DATE_TRUNC(DATE(oi.created_at), MONTH)) AS date,
  IF(p.brand IN (SELECT brand FROM top_brands), p.brand, 'Other') AS brand,
  p.department,
  ROUND(SUM(oi.sale_price), 2) AS revenue,
  ROUND(SUM(p.cost), 2) AS cost,
  COUNT(*) AS items,
  COUNT(DISTINCT oi.order_id) AS orders
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.products` p ON p.id = oi.product_id
WHERE DATE(oi.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  AND DATE(oi.created_at) < CURRENT_DATE()
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
