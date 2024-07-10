const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.listen(3001, () => {
  console.log('Server is running on port 3001');
});


const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://chenchen:19951210@cluster0.7thgave.mongodb.net/?retryWrites=true&w=majority";

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


app.get("/api/fake_posts", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('fakepost');

    // Query for all fake posts without any filtering
    const query = {};
    const projection = {
      "fakepost_url": 1,
      "fakepost_index": 1,
      "fakepost_title": 1,
      "fakepost_content": 1,
      "fakepost_image": 1,
      "fakepost_like": 1,
      "fakepost_time": 1,
      "fakepost_community":1,
      "fakepost_poster":1,
    };

    const result = await collection.find(query).project(projection).toArray();

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve fake post from the database" });
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
      "user_name": 1,
      "content": 1,
      "where_to_insert": 1,
      "ordinal_position": 1,
      "post_url": 1,
      "like":1,
      "time":1,
      "profile":1
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

// Define the route to retrieve fake_comments for a specific userid
app.get("/api/getuser_fake_comments_infakepost", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const userid = req.query.userid; // Get the userid from the query parameter

    // Query for fake_comments data from the collection with the userid filter
    const query = { userid: userid };
    const projection = {
      _id: 0,
      "user_comment_in_fake_post.fake_comment_id": 1,
      "user_comment_in_fake_post.user_name": 1,
      "user_comment_in_fake_post.content": 1,
      "user_comment_in_fake_post.where_to_insert": 1,
      "user_comment_in_fake_post.post_url": 1 , 
      "user_comment_in_fake_post.like": 1,
      "user_comment_in_fake_post.time":1
    };

    const result = await collection.find(query).project(projection).toArray();

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user_fake_comments_infakepost from the database" });
  } finally {
    await client.close();
  }
});

app.post("/api/updateuserFakeComment_infakepost", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        user_comment_in_fake_post:{
          fake_comment_id: req.body.user_comment_in_fake_post[0].fake_comment_id,
          user_name: req.body.user_comment_in_fake_post[0].user_name,
          content: req.body.user_comment_in_fake_post[0].content,
          where_to_insert: req.body.user_comment_in_fake_post[0].where_to_insert,
          ordinal_position: req.body.user_comment_in_fake_post[0].ordinal_position,
          post_url: req.body.user_comment_in_fake_post[0].post_url,
          like:req.body.user_comment_in_fake_post[0].like,
          time:req.body.user_comment_in_fake_post[0].time,
        }
      }
    };

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update fake comment in the database" });
  } finally {
    await client.close();
  }
});

// Define the route to retrieve user_reply_tofakecomment for a specific userid
app.get("/api/user_reply_tofakecomment", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const userid = req.query.userid; // Get the userid from the query parameter

    // Query for user_reply_tofakecomment data from the collection with the userid filter
    const query = { userid: userid };
    const projection = {
      _id: 0,
      user_reply_tofakecomment: 1
    };

    const result = await collection.find(query).project(projection).toArray();

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user_reply_tofakecomment from the database" });
  } finally {
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

// create fake post database 
app.post("/api/createfakepost", async (req, res) => {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('fakepost');

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



// update the user action, ex upvote or down vote for a comment
app.post("/api/updateUserVote_Comments", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');
    console.log("updateUserAction")
    console.log(req.body);
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        user_vote_onComments: {
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
    return res.status(500).json({ error: "Failed to update user updateUserVote_Comments data in the database" });
  } finally {
    await client.close();
  }
});

//edits the user profile
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
  

// update the user action, ex upvote or downvote a post 
app.post("/api/updateUserVote_Posts", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');
    console.log("updateUserAction")
    console.log(req.body);
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        user_vote_onPosts: {
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
    return res.status(500).json({ error: "Failed to update user updateUserVote_Posts data in the database" });
  } finally {
    await client.close();
  }
});

// update the user action, reply a comments
app.post("/api/updateUserReply_Comments", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');
    console.log("updateUserAction")
    console.log(req.body);
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        user_reply_onComments: {
          action_date: req.body.user_reply_onComments[0].action_date,
          reply_content: req.body.user_reply_onComments[0].reply_content,
          reply_comment: req.body.user_reply_onComments[0].reply_comment,
          reply_post: req.body.user_reply_onComments[0].reply_post
        }
      }
    };

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user updateUserReply_Comments data in the database" });
  } finally {
    await client.close();
  }
});

// update the user action, reply a post
app.post("/api/updateUserReply_Posts", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');
    console.log("updateUserAction")
    console.log(req.body);
    const filter = { userid: req.body.userid };
    const update = {
      $push: {
        user_reply_onPosts: {
          action_date: req.body.user_reply_onPosts[0].action_date,
          reply_content: req.body.user_reply_onPosts[0].reply_content,
          reply_post: req.body.user_reply_onPosts[0].reply_post,

        }
      }
    };

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user updateUserReply_Posts in the database" });
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




app.post("/api/updateUserReplyToFakeComment", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const filter = { userid: req.body.userid };
    let update = {};

    if (req.body.user_reply_tofakecomment) {
      update = {
        $push: {
          user_reply_tofakecomment: {
            fake_comment_id: req.body.user_reply_tofakecomment[0].fake_comment_id,
            userRedditName: req.body.user_reply_tofakecomment[0].userRedditName,
            userReplyInFake: req.body.user_reply_tofakecomment[0].userReplyInFake,
            like:req.body.user_reply_tofakecomment[0].like,
            time:req.body.user_reply_tofakecomment[0].time,
          }
        }
      };
    }

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user reply to fake comment in the database" });
  } finally {
    await client.close();
  }
});


// user like fake comment 
app.post("/api/updateUserVoteFakeContent", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const filter = { userid: req.body.userid };
    let update = {};

    if (req.body.user_vote_fake) {
      update = {
        $push: {
          user_vote_fake: {
            user_action:req.body.user_vote_fake[0].user_action,
            fake_content: req.body.user_vote_fake[0].fake_content,
          }
        }
      };
    }

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update user like fake content in the database" });
  } finally {
    await client.close();
  }
});

// delete user like fake comment 

app.post("/api/deleteUserVoteFakeContent", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const filter = { userid: req.body.userid };
    const  fake_content= req.body.fake_content;

    const update = {
      $pull: {
        user_vote_fake: { fake_content: fake_content }
      }
    };
    

    const result = await collection.updateOne(filter, update);

    return res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete user like fake content from the database" });
  } finally {
    await client.close();
  }
});

// Define the route to retrieve user like fake_comments for a specific userid
app.get("/api/getuserVotefakecontent", async function (req, res) {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('reddit');
    const collection = database.collection('users');

    const userid = req.query.userid; // Get the userid from the query parameter

    // Query for fake_comments data from the collection with the userid filter
    const query = { userid: userid };
    const projection = {
      _id: 0,
      "user_vote_fake.user_action":1,
      "user_vote_fake.fake_content": 1,
     
    };

    const result = await collection.find(query).project(projection).toArray();

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to retrieve user like fake content from the database" });
  } finally {
    await client.close();
  }
});


// Start the server listening for requests
app.listen(process.env.PORT || 3000, 
	() => console.log("Server is running..."));

// try to access reddit and send to token  

