const Octokit = require("@octokit/rest"),
  async = require('async'),
  https = require('https');

exports.handler = function(event, context, callback) {
  const { caption, url, image, key } = JSON.parse(event.body);
  const { IG_GIT_USER: user, IG_GIT_TOKEN: token, IG_GIT_REPO: repo, IG_SECRET_KEY } = process.env;  

  if (key !== IG_SECRET_KEY) {
    console.log("0.1: Incorrect key supplied");
    return callback(null, { statusCode: 401, body: "Incorrect key supplied" });
  };
   
  if (!image || !caption || !url) {
    console.log("0.2: Params not supplied");
    return callback(null, { statusCode: 400, body: "Params not supplied" });
  };
  
  const time = Date.now();
  const date = new Date();
  const github = new Octokit({ auth: 'token ' + token });

  async.waterfall([

    function scrape_image_from_instagram(callback){
      console.log("0.0. start");
      console.log("0.0.1 image: " + image);
      const imageSplit = image.split('/');
      const imageURL = "https://instagram.fscl10-1.fna.fbcdn.net/vp/c4f84e5c32f71bd2b5a3700174e5df1a/5CEA3BB4/t51.2885-15/e35/s1080x1080/" + imageSplit[imageSplit.length - 1] + "?_nc_ht=instagram.fscl10-1.fna.fbcdn.net";
      let imageData = "";
      console.log("1. imageURL: " + imageURL);
      https.get(imageURL, (resp) => {
        resp.setEncoding('base64');
        resp.on('data', (data) => { imageData += data});
        resp.on('end', () => callback(null, imageData));
      }).on('error', (e) => new Error(`Error scraping image: ${e.message}`));
    },

    function upload_image_blob(image, callback) {
      console.log("1.1. create blob: " + JSON.stringify(github));
      github.git.createBlob({
        owner: user,
        repo: repo,
        content: image,
        encoding: 'base64'
      }).then(result => {callback(null, result.data.sha)
      }).catch(error => {
        console.log("1.2. create blob error: " + JSON.stringify(error));
        return new Error(error)
      })
    },

    function get_branch_reference(image, callback){
      console.log("1.2.1. get_branch_reference image: " + image);
      github.git.getRef({
        owner: user,
        user: user,
        repo: repo,
        ref: 'heads/master'
      }).then(result => { callback(null, { image: image, commit: result.data.object.sha})
      }).catch(error => {
        console.log("1.2.2 get_branch_reference error: " + error);
        return new Error(error);
      })
    },

    // Create a tree ready to commit
    function create_tree(result, callback){
      const content = `---
title: Instagram - ${date.toString()}
tags: ["manada","cia","tropa","ruta"]
date: ${date.toISOString().slice(0,-14)}
image: img/uploads/${time}.jpg
originalURL: ${url}
---

${caption}`;

      const files = [{
        path: `static/img/uploads/${time}.jpg`,
        mode: '100644',
        type: 'blob',
        sha: result.image
      }, {
        path: `content/post/${time}.md`,
        mode: '100644',
        type: 'blob',
        content: content
      }];
      console.log("2. Create Tree Files: " + files);

      github.git.createTree({
        owner: user,
        user: user,
        repo: repo,
        tree: files,
        base_tree: result.commit
      }).then(res => {
          result.tree = res.data.sha;
          callback(null, result);
      }).catch(error => {
        console.log("2. Create Tree error: " + JSON.stringify(error));
        if (error) return new Error(error);
      })
    },


    function commit_the_files(result, callback){
      console.log("3. commit: " + result);
      github.git.createCommit({
        owner: user,
        user: user,
        repo: repo,
        message: `New instagram image: ${date.toString()}`,
        tree: result.tree,
        parents: [result.commit]
      }).then(res => {
        result.new = res.data.sha;
        callback(null, result);
      }).catch(error => {
        console.log("3. commit error: " + JSON.stringify(error));
        if (error) return new Error(error);
      })
    },


    function update_git_reference(result, callback){
      github.git.updateRef({
        owner: user,
        user: user,
        repo: repo,
        ref: 'heads/master',
        sha: result.new,
        force: true
      }).then(res => { 
        callback(null);
      }).catch(error => {
        console.log("3. update error: " + JSON.stringify(error));
        if (error) return new Error(error);
      })
    }

  ], function (err, result) {
    console.log("4. Funct Error: " + JSON.stringify(err));
    if (err) return callback(null, { statusCode: 400, body: err.message });
    else return callback(null, { statusCode: 200, body: 'Image imported' });
  });

};