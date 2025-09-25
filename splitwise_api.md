https://secure.splitwise.com/api/v3.0/get_expenses

List the current user's expenses

AUTHORIZATIONS:
ApiKeyAuth

 HTTP: ApiKeyAuth

For speed and ease of prototyping, you can generate a personal API key on your app's details page. You should present this key to the server via the Authorization header as a Bearer token. The API key is an access token for your personal account, so keep it as safe as you would a password. If your key becomes compromised or you want to invalidate your existing key for any other reason, you can do so on the app details page by generating a new key.
HTTP Authorization Scheme: bearer
Bearer format: API key

QUERY PARAMETERS

group_id	
integer
If provided, only expenses in that group will be returned, and friend_id will be ignored.
friend_id	
integer
ID of another user. If provided, only expenses between the current and provided user will be returned.
dated_after	
string <date-time>
dated_before	
string <date-time>
updated_after	
string <update-time>
updated_before	
string <date-time>
limit	
integer
Default: 20
offset	
integer
Default: 0
Responses

200 OK
RESPONSE SCHEMA: application/json

expenses	
Array of objects (expense)
Array 
cost	
string
A string representation of a decimal value, limited to 2 decimal places
description	
string
A short description of the expense
details	
string or null
Also known as "notes."
date	
string <date-time>
The date and time the expense took place. May differ from created_at
repeat_interval	
string
Enum: "never" "weekly" "fortnightly" "monthly" "yearly"
currency_code	
string
A currency code. Must be in the list from get_currencies
category_id	
integer
A category id from get_categories
id	
integer <int64>
group_id	
integer or null
Null if the expense is not associated with a group.
friendship_id	
integer or null
Null if the expense is not associated with a friendship.
expense_bundle_id	
integer or null
repeats	
boolean
Whether the expense recurs automatically
email_reminder	
boolean
Whether a reminder will be sent to involved users in advance of the next occurrence of a recurring expense. Only applicable if the expense recurs.
email_reminder_in_advance	
integer or null
Enum: null -1 0 1 2 3 4 5 6 7 14
Number of days in advance to remind involved users about the next occurrence of a new expense. Only applicable if the expense recurs.
next_repeat	
string or null
The date of the next occurrence of a recurring expense. Only applicable if the expense recurs.
comments_count	
integer
payment	
boolean
Whether this was a payment between users
transaction_confirmed	
boolean
If a payment was made via an integrated third party service, whether it was confirmed by that service.
repayments	
Array of objects
created_at	
string <date-time>
The date and time the expense was created on Splitwise
created_by	
object or null
updated_at	
string <date-time>
The last time the expense was updated.
updated_by	
object or null
deleted_at	
string or null <date-time>
If the expense was deleted, when it was deleted.
deleted_by	
object or null
category	
object
receipt	
object
users	
Array of objects (share)
comments	
Array of objects (comment)
