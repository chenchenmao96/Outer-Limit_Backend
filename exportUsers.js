const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// MongoDB URI
const uri = "mongodb+srv://chenchen:19951210@cluster0.7thgave.mongodb.net/?retryWrites=true&w=majority";

// Output file path
const outputPath = path.join(__dirname, 'exportedUsers.json');

// Function to fetch and export data
async function exportUsers() {
    const client = new MongoClient(uri, { useUnifiedTopology: true });

    try {
        await client.connect();
        const database = client.db('reddit');
        const collection = database.collection('users');

        // Fetch the relevant data: userid, userInteractions, browser_history, viewed_posts
        const users = await collection.find({}, { 
            projection: {
                userid: 1, 
                userInteractions: 1, 
                browser_history: 1, 
                viewed_posts: 1 
            } 
        }).toArray();

        // Write the data to a JSON file
        fs.writeFileSync(outputPath, JSON.stringify(users, null, 2), 'utf-8');
        console.log(`Data successfully written to ${outputPath}`);
        
    } catch (err) {
        console.error('Error fetching users:', err);
    } finally {
        await client.close();
    }
}

// Call the export function
exportUsers();