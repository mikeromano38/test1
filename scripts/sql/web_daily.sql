-- cube: web_daily (day x traffic_source)
SELECT
  FORMAT_DATE('%F', DATE(e.created_at)) AS date,
  e.traffic_source,
  COUNT(DISTINCT e.session_id) AS sessions,
  COUNT(*) AS events,
  COUNTIF(e.event_type = 'purchase') AS purchases,
  COUNTIF(e.event_type = 'cart') AS cart_adds
FROM `bigquery-public-data.thelook_ecommerce.events` e
WHERE DATE(e.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  AND DATE(e.created_at) < CURRENT_DATE()
GROUP BY 1, 2
ORDER BY 1, 2
