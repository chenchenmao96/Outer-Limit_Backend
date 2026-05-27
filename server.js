const express = require('express');
const path = require('path');
require('dotenv').config();
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const adminExportToken = process.env.ADMIN_EXPORT_TOKEN;
const experimentGroups = ["mlen", "mley", "mhen", "mhey"];

function createMongoClient() {
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is required");
  }

  return new MongoClient(uri, { useUnifiedTopology: true });
}

async function ensureIndexes() {
  if (!uri) {
    console.warn("MONGODB_URI is not set. Database indexes were not created.");
    return;
  }

  const client = createMongoClient();
  try {
    await client.connect();
    const db = client.db("reddit");
    await db.collection("users").createIndex({ userid: 1 }, { unique: true });
    await db.collection("fakepost").createIndex({ fakepost_url: 1, group: 1 });
    await db.collection("fakecomment").createIndex({ fakepost_id: 1 });
    console.log("Database indexes are ready.");
  } catch (err) {
    console.error("Failed to create database indexes:", err);
  } finally {
    await client.close();
  }
}

ensureIndexes();

function canExportAllData(req) {
  return Boolean(adminExportToken && req.get("x-admin-token") === adminExportToken);
}

function emptyUserInteractionsResponse(section, item) {
  return {
    userInteractions: {
      [section]: {
        [item]: []
      }
    }
  };
}

async function replaceUserArrayEntry(collection, filter, arrayPath, match, value) {
  await collection.updateOne(filter, { $pull: { [arrayPath]: match } });
  return collection.updateOne(filter, { $push: { [arrayPath]: value } });
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")
  );
}

function replyPullFilter(body, fallback) {
  if (body.reply_id) {
    return { reply_id: body.reply_id };
  }

  return fallback;
}

async function chooseLeastAssignedGroup(users) {
  const counts = Object.fromEntries(experimentGroups.map(group => [group, 0]));
  const groupCounts = await users.aggregate([
    { $match: { usergroup: { $in: experimentGroups } } },
    { $group: { _id: "$usergroup", count: { $sum: 1 } } }
  ]).toArray();

  groupCounts.forEach(item => {
    counts[item._id] = item.count;
  });

  const lowestCount = Math.min(...Object.values(counts));
  const leastAssignedGroups = experimentGroups.filter(group => counts[group] === lowestCount);
  return leastAssignedGroups[Math.floor(Math.random() * leastAssignedGroups.length)];
}

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
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Define the first route to retrieve data
app.get("/api/data", async function (req, res) {
  if (!canExportAllData(req)) {
    return res.status(403).json({ error: "Admin export token is required" });
  }

  const client = createMongoClient();
  
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
  const client = createMongoClient();

  try {
    await client.connect();

    const db = client.db("reddit");
    const users = db.collection("users");

    const { userid } = req.body || {};
    if (!userid) {
      return res.status(400).json({ error: "userid is required" });
    }

    const now = new Date();
    const existingUser = await users.findOne({ userid }, { projection: { usergroup: 1 } });
    const assignedGroup = existingUser && existingUser.usergroup
      ? existingUser.usergroup
      : await chooseLeastAssignedGroup(users);

    // 核心点：
    // 1) $setOnInsert: 只在“第一次创建用户”时写入 backend-balanced usergroup
    // 2) $set: 每次都更新 lastSeenAt（但不动 usergroup）
    // 3) findOneAndUpdate: 直接把“数据库里的那条用户”拿回来用于返回 usergroup
    const result = await users.findOneAndUpdate(
      { userid },
      {
        $setOnInsert: {
          ...req.body,              // 你原本就是把整个 body 存进去
          usergroup: assignedGroup,  // 确保首次写入 backend-balanced group
          createdAt: now,
        },
        $set: {
          lastSeenAt: now,
        },
      },
      {
        upsert: true,
        returnOriginal: false, // mongodb@3.x uses returnOriginal, not returnDocument
      }
    );

    let doc = result.value;
    if (!doc) {
      doc = await users.findOne({ userid });
    }

    if (!doc) {
      return res.status(500).json({ error: "User was not returned after insert/upsert" });
    }

    // doc 一定有（upsert=true），除非发生异常
    return res.status(200).json({
      userid: doc.userid,
      usergroup: doc.usergroup, // ✅ 不管是否已存在，都返回数据库里的 group
      created: !!(result.lastErrorObject && result.lastErrorObject.upserted), // true=刚插入；false=原来就存在
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to insert/upsert user" });
  } finally {
    await client.close();
  }
});

/////////  where we define fake comments on fake posts and fake post 

app.get("/api/getfakepost", async (req, res) => {
  const client = createMongoClient();
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
  const client = createMongoClient();

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
  const client = createMongoClient();

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
  const client = createMongoClient();

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
  const client = createMongoClient();

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
  const client = createMongoClient();

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
  const client = createMongoClient();

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
  const client = createMongoClient();

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
  const client = createMongoClient();

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
  const client = createMongoClient();

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
      return res.json({ viewed_posts: [] });
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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const vote = req.body.user_vote_onPosts[0];
    const result = await replaceUserArrayEntry(
      collection,
      filter,
      'userInteractions.votes.onPosts',
      { action_post: vote.action_post },
      compactObject({
        action_date: vote.action_date,
        user_action: vote.user_action,
        action_post: vote.action_post,
        target_post_title: vote.target_post_title,
        target_post_context: vote.target_post_context
      })
    );
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
  const client = createMongoClient();

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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const vote = req.body.user_vote_onFakePosts[0];
    const result = await replaceUserArrayEntry(
      collection,
      filter,
      'userInteractions.votes.onFakePosts',
      { action_fake_post: vote.action_fake_post },
      compactObject({
        action_date: vote.action_date,
        user_action: vote.user_action,
        action_fake_post: vote.action_fake_post,
        target_post_title: vote.target_post_title,
        target_post_context: vote.target_post_context
      })
    );
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
  const client = createMongoClient();

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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const vote = req.body.user_vote_onComments[0];
    const result = await replaceUserArrayEntry(
      collection,
      filter,
      'userInteractions.votes.onComments',
      {
        action_comment: vote.action_comment,
        action_post: vote.action_post
      },
      compactObject({
        action_date: vote.action_date,
        user_action: vote.user_action,
        action_comment: vote.action_comment,
        action_post: vote.action_post,
        target_comment_context: vote.target_comment_context,
        target_comment_author: vote.target_comment_author
      })
    );
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
  const client = createMongoClient();

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
      return res.json({ updatedCount: 0, removed: false });
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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const vote = req.body.user_vote_onFakeComments[0];
    const result = await replaceUserArrayEntry(
      collection,
      filter,
      'userInteractions.votes.onFakeComments',
      {
        action_fake_comment: vote.action_fake_comment,
        action_fake_post: vote.action_fake_post
      },
      compactObject({
        action_date: vote.action_date,
        user_action: vote.user_action,
        action_fake_comment: vote.action_fake_comment,
        action_fake_post: vote.action_fake_post,
        target_comment_context: vote.target_comment_context,
        target_comment_author: vote.target_comment_author
      })
    );
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
  const client = createMongoClient();

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
      return res.json({ updatedCount: 0, removed: false });
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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const reply = req.body.user_reply_onPosts[0];
    const update = {
      $push: {
        'userInteractions.replies.onPosts': compactObject({
          reply_id: reply.reply_id,
          action_date: reply.action_date,
          reply_content: reply.reply_content.trimEnd(),
          reply_post: reply.reply_post,
          target_post_title: reply.target_post_title,
          target_post_context: reply.target_post_context
        })
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
  const client = createMongoClient();

    try {
      await client.connect();
      const database = client.db('reddit');
      const collection = database.collection('users');
      const filter = { userid: req.body.userid };
      const update = {
        $pull: {
          'userInteractions.replies.onPosts': replyPullFilter(req.body, {
            reply_content: req.body.reply_content,
            reply_post: req.body.reply_post
          })
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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const reply = req.body.user_reply_onFakePosts[0];
    const update = {
      $push: {
        'userInteractions.replies.onFakePosts': compactObject({
          reply_id: reply.reply_id,
          action_date: reply.action_date,
          reply_content: reply.reply_content.trimEnd(),
          reply_fake_post: reply.reply_fake_post,
          target_post_title: reply.target_post_title,
          target_post_context: reply.target_post_context
        })
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
  const client = createMongoClient();

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
        return res.json({ replies: [] });
      }
    } else {
      return res.json({ replies: [] });
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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $pull: {
        'userInteractions.replies.onFakePosts': replyPullFilter(req.body, {
          reply_content: req.body.reply_content,
          reply_fake_post: req.body.reply_fake_post
        })
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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const reply = req.body.user_reply_onComments[0];
    const update = {
      $push: {
        'userInteractions.replies.onComments': compactObject({
          reply_id: reply.reply_id,
          action_date: reply.action_date,
          reply_to: reply.reply_to,
          reply_content: reply.reply_content.trimEnd(),
          reply_post: reply.reply_post,
          target_comment_context: reply.target_comment_context,
          target_comment_author: reply.target_comment_author
        })
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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $pull: {
        'userInteractions.replies.onComments': replyPullFilter(req.body, {
          reply_content: req.body.reply_content,
          reply_to: req.body.reply_to,
          reply_post: req.body.reply_post
        })
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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const reply = req.body.user_reply_onFakeComments[0];
    const update = {
      $push: {
        'userInteractions.replies.onFakeComments': compactObject({
          reply_id: reply.reply_id,
          action_date: reply.action_date,
          reply_to: reply.reply_to,
          reply_content: reply.reply_content.trimEnd(),
          reply_fake_post: reply.reply_fake_post,
          target_comment_context: reply.target_comment_context,
          target_comment_author: reply.target_comment_author
        })
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
  const client = createMongoClient();

  try {
    await client.connect();
    const database = client.db('reddit');
    const collection = database.collection('users');
    const filter = { userid: req.body.userid };
    const update = {
      $pull: {
        'userInteractions.replies.onFakeComments': replyPullFilter(req.body, {
          reply_to: req.body.reply_to,
          reply_fake_post: req.body.reply_fake_post, 
          reply_content: req.body.reply_content
        })
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
  const client = createMongoClient();

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
      return res.json(emptyUserInteractionsResponse("votes", "onFakePosts"));
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user votes on fake posts" });
  } finally {
    await client.close();
  }
});

app.get("/api/getUserVotes_onFakeComments", async function (req, res) {
  const client = createMongoClient();

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
      return res.json(emptyUserInteractionsResponse("votes", "onFakeComments"));
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user votes on fake comments" });
  } finally {
    await client.close();
  }
});

app.get("/api/getUserComments_onFakePosts", async function (req, res) {
  const client = createMongoClient();

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
      return res.json(emptyUserInteractionsResponse("replies", "onFakePosts"));
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user comments on fake posts" });
  } finally {
    await client.close();
  }
});

app.get("/api/getUserComments_onFakeComments", async function (req, res) {
  const client = createMongoClient();

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
      return res.json(emptyUserInteractionsResponse("replies", "onFakeComments"));
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
