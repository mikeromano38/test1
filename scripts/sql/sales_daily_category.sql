-- cube: sales_daily_category (day x category x department)
SELECT
  FORMAT_DATE('%F', DATE(oi.created_at)) AS date,
  p.category,
  p.department,
  ROUND(SUM(oi.sale_price), 2) AS revenue,
  ROUND(SUM(p.cost), 2) AS cost,
  COUNT(*) AS items,
  COUNT(DISTINCT oi.order_id) AS orders,
  COUNTIF(oi.returned_at IS NOT NULL) AS returned_items
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.products` p ON p.id = oi.product_id
WHERE DATE(oi.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  AND DATE(oi.created_at) < CURRENT_DATE()
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
