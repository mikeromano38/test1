-- cube: sales_monthly_geo (month x country x state)
SELECT
  FORMAT_DATE('%F', DATE_TRUNC(DATE(oi.created_at), MONTH)) AS date,
  u.country,
  IF(u.country = 'United States', u.state, NULL) AS state,
  ROUND(SUM(oi.sale_price), 2) AS revenue,
  COUNT(DISTINCT oi.order_id) AS orders,
  COUNT(*) AS items,
  COUNT(DISTINCT oi.user_id) AS customers
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.users` u ON u.id = oi.user_id
WHERE DATE(oi.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  AND DATE(oi.created_at) < CURRENT_DATE()
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
