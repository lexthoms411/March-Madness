function doGet() {
    var html = HtmlService.createHtmlOutputFromFile('comments')
        .setTitle("Comments Section");
    return html;
}

function getComments() {
    var cache = CacheService.getScriptCache();  // Get the script-level cache
    var cachedComments = cache.get("comments"); 

    if (cachedComments) {
        Logger.log("✅ Returning cached comments");
        return JSON.parse(cachedComments); // Use cached data if available
    }

    Logger.log("🆕 Fetching comments from the sheet");

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Form Responses");
    if (!sheet) {
        Logger.log("❌ Error: 'Form Responses' sheet not found.");
        return [];
    }

    var data = sheet.getDataRange().getValues();
    var comments = [];

    for (var i = 1; i < data.length; i++) {
        if (data[i][1] && data[i][2]) {  // Ensure name and comment exist
            let timestamp = data[i][0] ? new Date(data[i][0]).toLocaleString() : "Unknown Time"; // Convert timestamp to readable format
            let iconUrl = data[i][3] || "https://raw.githubusercontent.com/lexthoms411/March-Madness/main/icons/default_icon.png"; // Use your updated default icon

            comments.push({
                name: data[i][1],  // Column B - Name
                comment: data[i][2],  // Column C - Comment
                icon: iconUrl,
                time: timestamp  // Store timestamp
            });
        }
    }

    // Reverse the comments array so newest comments appear first
    comments.reverse();

    // Store the result in cache for 5 minutes (300 seconds)
    cache.put("comments", JSON.stringify(comments), 300);

    return comments;
}

function saveComment(name, comment, icon) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Form Responses");
    sheet.appendRow([new Date(), name, comment, icon]); // Store comment with timestamp

    // Clear the cache so next request gets fresh data
    CacheService.getScriptCache().remove("comments");
}





