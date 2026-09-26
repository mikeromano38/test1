-- cube: sales_monthly_customer (month x gender x age_band x traffic_source)
SELECT
  FORMAT_DATE('%F', DATE_TRUNC(DATE(oi.created_at), MONTH)) AS date,
  u.gender,
  CASE WHEN u.age < 25 THEN 'Under 25' WHEN u.age < 35 THEN '25-34' WHEN u.age < 45 THEN '35-44'
       WHEN u.age < 55 THEN '45-54' ELSE '55+' END AS age_band,
  u.traffic_source,
  ROUND(SUM(oi.sale_price), 2) AS revenue,
  COUNT(DISTINCT oi.order_id) AS orders,
  COUNT(*) AS items,
  COUNT(DISTINCT oi.user_id) AS customers
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.users` u ON u.id = oi.user_id
WHERE DATE(oi.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  AND DATE(oi.created_at) < CURRENT_DATE()
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4
