const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.listen(3001, () => {
  console.log('Server is running on port 3001');
});


const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://chm321:19951210m@cluster0.zcilmph.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Use the express.json middleware to parse JSON bodies
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


app.use(express.json());

//to use public folder
const publicPath = path.resolve(__dirname, "public");
app.use(express.static(publicPath));

//route for homepage
app.get("/", (req,res)=>{
  res.render("index", {});
});

// Define the first route to retrieve data
app.get("/api/data", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  
  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    // Query for data from the collection
    const query = {};
    const cursor = await collection.find(query);

    const data = await cursor.toArray();

    return res.json(data);
  } catch(err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve data from the database" });
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
});


// Define the second route to initalze the database
app.post("/api/insert", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  
  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    // Insert new data into the collection
    const result = await collection.insertOne(req.body);

    return res.json({ insertedId: result.insertedId });
  } catch(err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to insert data into the database" });
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
});

/////////  where we define fake comments on fake posts and fake post 

app.get("/api/getfakepost", async (req, res) => {
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  try {
    await client.connect();

    const db = client.db("reddit");
    const col = db.collection("fakepost");

    // grab both params
    const { fakepost_url, group } = req.query;

    // build dynamic filter
    const filter = {};
    if (fakepost_url) filter.fakepost_url = fakepost_url;
    if (group)         filter.group        = group;

    let posts;
    if (Object.keys(filter).length === 0) {
      // no filters? return everything
      posts = await col.find({}).toArray();
    } else {
      // one or both filters? return only matching docs
      posts = await col.find(filter).toArray();
      if (posts.length === 0) {
        return res.status(404).json({ error: "No matching fake posts" });
      }
    }

    return res.json(posts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve fake posts" });
  } finally {
    await client.close();
  }
});




// Define the route to retrieve all fake comments
app.get("/api/fake_comments", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('fakecomment');

    // Query for all fake_comments data from the collection
    const query = {};
    const projection = {
      "fake_comment_id": 1,
      "fakepost_id":1,
      "user_name": 1,
      "content": 1,
      "like":1,
      "time":1
    };

    const result = await collection.find(query).project(projection).toArray();

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve fake comments from the database" });
  } finally {
    await client.close();
  }
});


// create fake post database 
app.post("/api/createfakepost", async (req, res) => {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('fakepost');

    // Create the fake post object with an empty fake_comments array if not provided
    const newFakePost = {
      ...req.body,
      fake_comments: req.body.fake_comments || []  // Ensure fake_comments is initialized as an array
    };

    // Insert new fake post data into the collection
    const result = await collection.insertOne(newFakePost);

    return res.json({ insertedId: result.insertedId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to insert data into the database" });
  } finally {
    // Ensure that the client will close after the operation
    await client.close();
  }
});
/// insert fake comments inside the fake post 
app.post("/api/addfakecomment/:postId", async (req, res) => {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('fakepost');

    const postId = req.params.postId; // The fake post ID passed as a parameter
    const newComment = req.body; // The new comment data sent in the request body

    // Find the fake post and add the new comment to the fake_comments array
    const result = await collection.updateOne(
      { fakepost_id: postId }, // Find the post by fakepost_id
      { $push: { fake_comments: newComment } } // Add the new comment to the fake_comments array
    );

    if (result.modifiedCount === 1) {
      return res.json({ message: "Comment added successfully" });
    } else {
      return res.status(404).json({ error: "Fake post not found" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to add comment to the fake post" });
  } finally {
    await client.close();
  }
});

// create fakecomment database 
app.post("/api/createfakecomment", async (req, res) => {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('fakecomment');

    // Insert new data into the collection
    const result = await collection.insertOne(req.body);

    return res.json({ insertedId: result.insertedId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to insert data into the database" });
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
});


//user 's selection 
app.post("/api/midpopup_select", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');
    console.log("midpopup_select");
    console.log(req.body);
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
          surveypopup_selections: req.body.surveypopup_selections
      }
    };

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user midpopup_select data in the database" });
  } finally {
    await client.close();
  }
});



// update user browser history 
app.post("/api/updateBrowserHistory", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        browser_history: {
          browser_date: req.body.browser_history[0].browser_date,
          browser_url: req.body.browser_history[0].browser_url
        }
      }
    };

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update browser history data in the database" });
  } finally {
    await client.close();
  }
});


// update user time spend on reddit everyday
app.post("/api/updateActiveOnReddit", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        active_onReddit: {
          timeOnSite: req.body.active_onReddit[0].timeOnSite,
          timeOnSite_date: req.body.active_onReddit[0].timeOnSite_date
        }
      }
    };

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user time spend on reddit everyday in the database" });
  } finally {
    await client.close();
  }
});



// update user viewed post history 
app.post("/api/updateViwedPost", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        viewed_posts: {
          viewed_date: req.body.viewed_posts[0].viewed_date,
          post_url: req.body.viewed_posts[0].post_url
        }
      }
    };

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update updateViwedPost data in the database" });
  } finally {
    await client.close();
  }
});

app.get("/api/getViewedPosts", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    // Assuming userid is passed as a query parameter, for example: /api/getViewedPosts?userid=123
    const filter = { userid: req.query.userid };

    const user = await collection.findOne(filter, { projection: { viewed_posts: 1, _id: 0 } });

    if (user) {
      return res.json(user);
    } else {
      return res.status(404).json({ error: "User not found" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve viewed posts data from the database" });
  } finally {
    await client.close();
  }
});

/////////  where we define fake comments on fake posts and fake post and others  



////// USER VOTE USER VOTE USER VOTE USER VOTE USER VOTE 
// Update user votes for posts
app.post("/api/updateUserVote_onPosts", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        'userInteractions.votes.onPosts': {
          action_date: req.body.user_vote_onPosts[0].action_date,
          user_action: req.body.user_vote_onPosts[0].user_action,
          action_post: req.body.user_vote_onPosts[0].action_post
        }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user votes on posts" });
  } finally {
    await client.close();
  }
});

// Remove user votes for posts
app.post("/api/removeUserVote_onPosts", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $pull: {
        'userInteractions.votes.onPosts': { action_post: req.body.action_post }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove user vote on posts" });
  } finally {
    await client.close();
  }
});

// Update user votes for fake posts
app.post("/api/updateUserVote_onFakePosts", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        'userInteractions.votes.onFakePosts': {
          action_date: req.body.user_vote_onFakePosts[0].action_date,
          user_action: req.body.user_vote_onFakePosts[0].user_action,
          action_fake_post: req.body.user_vote_onFakePosts[0].action_fake_post
        }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user votes on fake posts" });
  } finally {
    await client.close();
  }
});

// Remove user votes for fake posts
app.post("/api/removeUserVote_onFakePosts", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $pull: {
        'userInteractions.votes.onFakePosts': { action_fake_post: req.body.action_fake_post }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove user vote on fake posts" });
  } finally {
    await client.close();
  }
});

// Update user votes for comments
app.post("/api/updateUserVote_onComments", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        'userInteractions.votes.onComments': {
          action_date: req.body.user_vote_onComments[0].action_date,
          user_action: req.body.user_vote_onComments[0].user_action,
          action_comment: req.body.user_vote_onComments[0].action_comment,
          action_post: req.body.user_vote_onComments[0].action_post
        }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user votes on comments" });
  } finally {
    await client.close();
  }
});

// Remove user votes for comments
app.post("/api/removeUserVote_onComments", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    
    const update = {
      $pull: {
        'userInteractions.votes.onComments': {
          action_comment: req.body.action_comment,  // Ensure it matches the comment
          action_post: req.body.action_post,        // Ensure it matches the post
          
        }
      }
    };
    
    const result = await collection.updateOne(filter, update);

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Vote not found" });
    }

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove user vote on comments" });
  } finally {
    await client.close();
  }
});

// Update user votes for fake comments
app.post("/api/updateUserVote_onFakeComments", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        'userInteractions.votes.onFakeComments': {
          action_date: req.body.user_vote_onFakeComments[0].action_date,
          user_action: req.body.user_vote_onFakeComments[0].user_action,
          action_fake_comment: req.body.user_vote_onFakeComments[0].action_fake_comment,
          action_fake_post: req.body.user_vote_onFakeComments[0].action_fake_post      
        }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user votes on fake comments" });
  } finally {
    await client.close();
  }
});

// Remove user votes for fake comments
app.post("/api/removeUserVote_onFakeComments", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    
    const update = {
      $pull: {
        'userInteractions.votes.onFakeComments': {
          action_fake_comment: req.body.action_fake_comment,  // Ensure it matches the fake comment
          action_fake_post: req.body.action_fake_post,        // Ensure it matches the fake post
         
        }
      }
    };
    
    const result = await collection.updateOne(filter, update);

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Vote not found" });
    }

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove user vote on fake comments" });
  } finally {
    await client.close();
  }
});




//////////// USER REPLIES USER PREPLIES 
// Update user replies for posts
app.post("/api/updateUserReply_onPosts", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        'userInteractions.replies.onPosts': {
          action_date: req.body.user_reply_onPosts[0].action_date,
          reply_content: req.body.user_reply_onPosts[0].reply_content.trimEnd(),
          reply_post: req.body.user_reply_onPosts[0].reply_post,
        }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user replies on posts" });
  } finally {
    await client.close();
  }
});

// Remove user replies for real posts
app.post("/api/removeUserReply_onPosts", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

    try {
      await client.connect();
      const database = client.db('reddit');
      const collection = database.collection('users');
      const filter = { userid: req.body.userid };
      const update = {
        $pull: {
          'userInteractions.replies.onPosts': { 
          reply_content: req.body.reply_content,
          reply_post: req.body.reply_post }
        }
      };
      const result = await collection.updateOne(filter, update);
      return res.json({ updatedCount: result.modifiedCount });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to remove user reply on real posts" });
    } finally {
      await client.close();
    }
});

// Update user replies for fake posts
app.post("/api/updateUserReply_onFakePosts", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        'userInteractions.replies.onFakePosts': {
          action_date: req.body.user_reply_onFakePosts[0].action_date,
          reply_content: req.body.user_reply_onFakePosts[0].reply_content.trimEnd(),
          reply_fake_post: req.body.user_reply_onFakePosts[0].reply_fake_post,
        }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user replies on fake posts" });
  } finally {
    await client.close();
  }
});

app.get("/api/getUserReplyToFakePosts", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');

    // Extract the userid and fakePostId from the query parameters
    const filter = { userid: req.query.userid };
    const fakePostId = req.query.fakePostId;

    // Find the user and project only the relevant fields
    const user = await collection.findOne(filter, { 
      projection: { 
        'userInteractions.replies.onFakePosts': 1 
      }
    });

    if (user && user.userInteractions && user.userInteractions.replies.onFakePosts) {
      // Filter replies to only include those that match the provided fakePostId
      const replies = user.userInteractions.replies.onFakePosts.filter(reply => reply.reply_fake_post === fakePostId);

      // Check if there are any replies
      if (replies.length > 0) {
        return res.json({ replies });
      } else {
        return res.status(404).json({ error: "No replies found for this fake post" });
      }
    } else {
      return res.status(404).json({ error: "User or replies not found" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user replies to fake posts" });
  } finally {
    await client.close();
  }
});

// Remove user replies for fake posts
app.post("/api/removeUserReply_onFakePosts", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $pull: {
        'userInteractions.replies.onFakePosts': { 
        reply_content: req.body.reply_content,
        reply_fake_post: req.body.reply_fake_post }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove user reply on fake posts" });
  } finally {
    await client.close();
  }
});

// Update user replies for comments
app.post("/api/updateUserReply_onComments", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        'userInteractions.replies.onComments': {
          action_date: req.body.user_reply_onComments[0].action_date,
          reply_to: req.body.user_reply_onComments[0].reply_to,  // The comment being replied to
          reply_content: req.body.user_reply_onComments[0].reply_content.trimEnd(),  // The user's reply
          reply_post: req.body.user_reply_onComments[0].reply_post
        }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user replies on comments" });
  } finally {
    await client.close();
  }
});

// Remove user replies for comments
app.post("/api/removeUserReply_onComments", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $pull: {
        'userInteractions.replies.onComments': { 
          reply_content: req.body.reply_content,  // Ensure it matches the comment
          reply_to: req.body.reply_to, 
          reply_post:  req.body.reply_post        // Ensure it matches the comment the user replied t
           }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove user reply on comments" });
  } finally {
    await client.close();
  }
});

// Update user replies for fake comments
app.post("/api/updateUserReply_onFakeComments", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        'userInteractions.replies.onFakeComments': {
          action_date: req.body.user_reply_onFakeComments[0].action_date,
          reply_to: req.body.user_reply_onFakeComments[0].reply_to,  // The fake comment being replied to
          reply_content: req.body.user_reply_onFakeComments[0].reply_content.trimEnd(),  // The user's reply to the fake comment
          reply_fake_post: req.body.user_reply_onFakeComments[0].reply_fake_post
        }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user replies on fake comments" });
  } finally {
    await client.close();
  }
});

// Remove user replies for fake comments
app.post("/api/removeUserReply_onFakeComments", async function(req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $pull: {
        'userInteractions.replies.onFakeComments': {
          reply_to: req.body.reply_to,
          reply_fake_post: req.body.reply_fake_post, 
          reply_content: req.body.reply_content
         }
      }
    };
    const result = await collection.updateOne(filter, update);
    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove user reply on fake comments" });
  } finally {
    await client.close();
  }
});


////// read user's action on fake post includes fake comments only ///////////////
app.get("/api/getUserVotes_onFakePosts", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');

    // Querying for user votes on fake posts
    const filter = { userid: req.query.userid };
    const user = await collection.findOne(filter, { projection: { 'userInteractions.votes.onFakePosts': 1, _id: 0 } });

    if (user) {
      return res.json(user);
    } else {
      return res.status(404).json({ error: "User not found" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user votes on fake posts" });
  } finally {
    await client.close();
  }
});

app.get("/api/getUserVotes_onFakeComments", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');

    // Querying for user votes on fake comments
    const filter = { userid: req.query.userid };
    const user = await collection.findOne(filter, { projection: { 'userInteractions.votes.onFakeComments': 1, _id: 0 } });

    if (user) {
      return res.json(user);
    } else {
      return res.status(404).json({ error: "User not found" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user votes on fake comments" });
  } finally {
    await client.close();
  }
});

app.get("/api/getUserComments_onFakePosts", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');

    // Querying for user comments on fake posts
    const filter = { userid: req.query.userid };
    const user = await collection.findOne(filter, { projection: { 'userInteractions.replies.onFakePosts': 1, _id: 0 } });

    if (user) {
      return res.json(user);
    } else {
      return res.status(404).json({ error: "User not found" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user comments on fake posts" });
  } finally {
    await client.close();
  }
});

app.get("/api/getUserComments_onFakeComments", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');

    // Querying for user comments on fake comments
    const filter = { userid: req.query.userid };
    const user = await collection.findOne(filter, { projection: { 'userInteractions.replies.onFakeComments': 1, _id: 0 } });

    if (user) {
      return res.json(user);
    } else {
      return res.status(404).json({ error: "User not found" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user comments on fake comments" });
  } finally {
    await client.close();
  }
});

app.listen(process.env.PORT || 3000, 
	() => console.log("Server is running..."));