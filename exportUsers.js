const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// MongoDB URI
const uri = process.env.MONGODB_URI;

// Output file path
const outputPath = path.join(__dirname, 'exportedUsers.json');

// Function to fetch and export data
async function exportUsers() {
    if (!uri) {
        throw new Error('MONGODB_URI environment variable is required');
    }

    const client = new MongoClient(uri, { useUnifiedTopology: true });

    try {
        await client.connect();
        const database = client.db('reddit');
        const collection = database.collection('users');

        // Fetch the relevant data: userid, userInteractions, browser_history, viewed_posts
        const users = await collection.find({}, { 
            projection: {
                userid: 1, 
                usergroup: 1
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
