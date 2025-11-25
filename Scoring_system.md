## Scoring System
Base Priority Points:
IMPORTANT (errors) = 1000 points
WARN (warnings, unknown faces) = 500 points
INFO (recognized faces) = 100 points
Time Decay Weights:
0-1 hour ago: 100% weight (full priority)
1-6 hours ago: 80% weight
6-24 hours ago: 50% weight
24-72 hours ago: 20% weight
72+ hours ago: 5% weight
Example Scores:
Alert	Level	Age	Score	Priority
System restart	IMPORTANT	30 min	1000	🔴 Highest
Camera error	IMPORTANT	2 days	200	🟡 Medium
Unknown person	WARN	10 min	500	🟠 High
Unknown person	WARN	5 days	25	⚪ Low
Known face	INFO	1 hour	80	⚪ Low
Result: A recent system restart (1000 points) will appear above an unknown person from 5 days ago (25 points), which is exactly what you wanted! The alerts are now sorted by this combined score, giving you the most relevant and timely information first.