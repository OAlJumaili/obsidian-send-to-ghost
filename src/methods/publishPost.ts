/* eslint-disable @typescript-eslint/no-var-requires */
import { SettingsProp, ContentProp, DataProp } from "./../types/index";
import { MarkdownView, Notice, requestUrl } from "obsidian";
import { sign } from "jsonwebtoken";

const matter = require("gray-matter");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt();
const version = "v4";

const contentPost = (frontmatter: ContentProp, data: DataProp) => ({
	posts: [
		{
			...frontmatter,
			html: md.render(data.content),
		},
	],
});

export const publishPost = async (
	view: MarkdownView,
	settings: SettingsProp
) => {
	// Ghost Url and Admin API key
	const key = settings.adminToken;
	if (key.includes(":")) {
	const [id, secret] = key.split(":");

	// Create the token (including decoding secret)
	const token = sign({}, Buffer.from(secret, "hex"), {
		keyid: id,
		algorithm: "HS256",
		expiresIn: "5m",
		audience: `/${version}/admin/`,
	});

	// get frontmatter
	const noteFile = view.app.workspace.getActiveFile();
	// @ts-ignore
	const metaMatter = app.metadataCache.getFileCache(noteFile).frontmatter;
	const data = matter(view.getViewData());

	const frontmatter = {
		id: metaMatter?.id || undefined,
		title: metaMatter?.title || view.file.basename,
		updated_at: metaMatter?.updated_at || undefined,
		tags: metaMatter?.tags || [],
		featured: metaMatter?.featured || false,
		status: metaMatter?.published ? "published" : "draft",
		excerpt: metaMatter?.excerpt || undefined,
		feature_image: metaMatter?.feature_image || undefined,
	};
	try{
	let result: any;
	//Create Post if id is null
	if (! frontmatter.id) {
		const post = JSON.stringify(contentPost(frontmatter, data))
		if (settings.debug == true) {
		console.log("Request: " + post)
	}
		result = await requestUrl({
			url: `${settings.url}/ghost/api/${version}/admin/posts/?source=html`,
			method: "POST",
			contentType: "application/json",
			headers: {
				"Accept-Version": version,
				"Access-Control-Allow-Methods": "POST",
				"Content-Type": "application/json;charset=utf-8",
				Authorization: `Ghost ${token}`,
			},
			body: post
		})
	}
	else {
		// Fetch updated_at for updates if null
		if (!frontmatter.updated_at) {
    		const pre = await requestUrl({
    		  url: `${settings.url}/ghost/api/${version}/admin/posts/${frontmatter.id}/?fields=updated_at`,
    		  method: "GET",
    		  headers: {
    		    "Accept-Version": version,
    		    "Content-Type": "application/json;charset=utf-8",
    		    Authorization: `Ghost ${token}`,
    		  },
    		});
    		frontmatter.updated_at = pre.json?.posts?.[0]?.updated_at;
    	}
		const post = JSON.stringify(contentPost(frontmatter, data))
		if (settings.debug == true) {
		console.log("Request: " + post)
		}
		try {
			result = await requestUrl({
				url: `${settings.url}/ghost/api/${version}/admin/posts/${frontmatter.id}/?source=html`,
				method: "PUT",
				contentType: "application/json",
				headers: {
					"Accept-Version": version,
					"Access-Control-Allow-Methods": "PUT",
					"Content-Type": "application/json;charset=utf-8",
					Authorization: `Ghost ${token}`,
				},
				body: post
			})
		}
		catch (e) {
			if (e?.status === 409) {
				const ref = await requestUrl({
    			  	url: `${settings.url}/ghost/api/${version}/admin/posts/${frontmatter.id}/?fields=updated_at`,
    			  	method: "GET",
    			  	headers: {
    			  	  "Accept-Version": version,
    			  	  "Content-Type": "application/json;charset=utf-8",
    			  	  Authorization: `Ghost ${token}`,
    			  	},
    			});
    			frontmatter.updated_at = ref.json?.posts?.[0]?.updated_at;
			
    			const retryPost = JSON.stringify(contentPost(frontmatter, data));
    			if (settings.debug == true) console.log("Retry (PUT): " + retryPost);
			
    			result = await requestUrl({
    			  	url: `${settings.url}/ghost/api/${version}/admin/posts/${frontmatter.id}/?source=html`,
    			  	method: "PUT",
    			  	contentType: "application/json",
    			  	headers: {
    			  	  "Accept-Version": version,
    			  	  "Access-Control-Allow-Methods": "PUT",
    			  	  "Content-Type": "application/json;charset=utf-8",
    			  	  Authorization: `Ghost ${token}`,
    			  	},
    			  	body: retryPost,
    			});
			}
			else {
				throw e;
			}
		}
	}

	const json = result.json;
	
	if (settings.debug == true) {
		console.log(JSON.stringify(json))
	}

	if (json?.posts) {
		new Notice(
			`"${json?.posts?.[0]?.title}" has been ${json?.posts?.[0]?.status} successful!`
		);
		await view.app.fileManager.processFrontMatter(noteFile, (m) => {
		  m.id = json?.posts?.[0]?.id;
		  m.updated_at = json?.posts?.[0]?.updated_at;
		});
	} else {
		new Notice(`${json.errors[0].context || json.errors[0].message}`);
		new Notice(
			`${json.errors[0]?.details[0].message} - ${json.errors[0]?.details[0].params.allowedValues}`
		);
	}

	return json;
} catch (error: any) {
	new Notice(`Couldn't connect to the Ghost API. Is the API URL and Admin API Key correct?

${error.name}: ${error.message}`)
}}
else {
	new Notice("Error: Ghost API Key is invalid.")
}};
