import * as Vue from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import {mixin} from "https://mavue.mavo.io/mavue.js";
import GraffitiPlugin from "https://graffiti.garden/graffiti-js/plugins/vue/plugin.js";
import Resolver from "./resolver.js";

const app = {
    // Import MaVue
    mixins: [mixin],

    // Import resolver
    created() {
        this.resolver = new Resolver(this.$gf);
    },

    setup() {
        // Initialize the name of the channel we're chatting in
        const channel = Vue.ref("");
        const $gf = Vue.inject("graffiti");

        // And a flag for whether or not we're private-messaging
        const privateMessaging = Vue.ref(false);
        const userContext = Vue.computed(() => [$gf.me]
        );
        const {objects: groupsRaw} = $gf.useObjects(userContext)

        // If we're private messaging use "me" as the channel,
        // otherwise use the channel value
        const context = Vue.computed(() =>
            privateMessaging.value ? [$gf.me] : [channel.value]
        );

        // Initialize the collection of messages associated with the context
        const {objects: messagesRaw} = $gf.useObjects(context);
        return {channel, privateMessaging, messagesRaw, groupsRaw};
    },


    data() {
        // Initialize some more reactive variables
        return {
            messageText: "",
            editID: "",
            editText: "",
            recipient: "",
            file: null,
            downloadedImages: {},
            replyTo: null,
            showPinned: false,
            showTagged: false,
        };
    },

    computed: {
        groups() {
            return this.groupsRaw.filter(
                (m) => m.type === "Group" && m.content && typeof m.content == "string"
            )
        },
        messages() {
            let messages = this.messagesRaw
                // Filter the "raw" messages for data
                // that is appropriate for our application
                // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-note
                .filter(
                    (m) =>
                        // Does the message have a type property?
                        m.type &&
                        // Is the value of that property 'Note'?
                        m.type == "Note" &&
                        // Does the message have a content property?
                        m.content &&
                        // Is that property a string?
                        typeof m.content == "string"
                );

            // Do some more filtering for private messaging
            if (this.privateMessaging) {
                messages = messages.filter(
                    (m) =>
                        // Is the message private?
                        m.bto &&
                        // Is the message to exactly one person?
                        m.bto.length === 1 &&
                        // Is the message to the recipient?
                        (m.bto[0] === this.recipient ||
                            // Or is the message from the recipient?
                            m.actor === this.recipient)
                );
            }

            return (
                messages
                    // Sort the messages with the
                    // most recently created ones first
                    .sort((m1, m2) => new Date(m2.published) - new Date(m1.published))
                    // Only show the 10 most recent ones
                    .slice(0, 100)
            );
        },
        messagesMap() {
            // a map of message id to message
            return this.messages.reduce((map, message) => {
                map[message.id] = message;
                return map;
            }, {});
        }
    },

    methods: {
        togglePinnedMessages() {
            this.showPinned = !this.showPinned;
        },
        toggleTaggedMessages() {
            this.showTagged = !this.showTagged;
        },
        addGroup() {
            this.$gf.post({
                type: "Group",
                content: this.channel,
                context: [this.$gf.me],
            });
        },
        removeGroup(group) {
            this.$gf.remove(group);
        },
        selectGroup(channel) {
            this.channel = channel.content;
            this.privateMessaging = false;
        },
        async sendMessage() {

            const message = {
                type: "Note",
                content: this.messageText,
            };

            // Reset the value of the input box to the placeholder after the transition
            if (this.messageText !== '') {
                let inputBox = document.getElementById('myInput');
                // inputBox.classList.add('move-up');
                // setTimeout(() => {
                //     inputBox.value = '';
                //     inputBox.classList.remove('move-up');
                // }, 500);  // 500ms is the duration of the transition
            } else {
                console.log('empty');
                let submitButton = document.getElementById('submit');
                submitButton.classList.add('input-error');
                submitButton.value = 'Invalid';
                // setTimeout(() => {
                //     submitButton.value = 'Send';
                //     submitButton.classList.remove('input-error');
                // }, 500);  // 500ms is theduration of the transition
            }

            if (this.file) {
                const uri = await this.$gf.media.store(this.file)
                message.attachment = {
                    type: "Image",
                    magnet: uri
                }
                this.file = null
            }

            // The context field declares which
            // channel(s) the object is posted in
            // You can post in more than one if you want!
            // The bto field makes messages private
            if (this.privateMessaging) {
                message.bto = [this.recipient];
                message.context = [this.$gf.me, this.recipient];
            } else {
                message.context = [this.channel];
            }

            if (this.replyTo) {
                message.replyTo = this.replyTo;
                this.replyTo = null;
            }

            // Send!
            this.$gf.post(message);
            this.messageText = "";
        },

        removeMessage(message) {
            this.$gf.remove(message);
        },

        startEditMessage(message) {
            // Mark which message we're editing
            this.editID = message.id;
            // And copy over it's existing text
            this.editText = message.content;
        },

        saveEditMessage(message) {
            // Save the text (which will automatically
            // sync with the server)
            message.content = this.editText;
            // And clear the edit mark
            this.editID = "";
        },
        handleFileUpload(event) {
            this.file = event.target.files[0]
        },
        replyToMessage(message) {
            this.replyTo = message.id;
        },
        removeReplyTo() {
            this.replyTo = null;
        }
    },
    watch: {
        messages(messages) {
            const images = messages.filter(m => m.attachment && m.attachment.type === 'Image' && typeof m.attachment.magnet == 'string' && !this.downloadedImages[m.attachment.magnet])
            images.forEach(async m => {
                this.downloadedImages[m.attachment.magnet] = URL.createObjectURL(await this.$gf.media.fetch(m.attachment.magnet))
            })
        }
    }
};

const Name = {
    props: ['actor', 'editable'],

    setup(props) {
        // Get a collection of all objects associated with the actor
        const {actor} = Vue.toRefs(props)
        const $gf = Vue.inject('graffiti')
        return $gf.useObjects([actor])
    },

    computed: {
        profile() {
            return this.objects
                // Filter the raw objects for profile data
                // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-profile
                .filter(m =>
                    // Does the message have a type property?
                    m.type &&
                    // Is the value of that property 'Profile'?
                    m.type == 'Profile' &&
                    // Does the message have a name property?
                    m.name &&
                    // Is that property a string?
                    typeof m.name == 'string')
                // Choose the most recent one or null if none exists
                .reduce((prev, curr) => !prev || curr.published > prev.published ? curr : prev, null)
        }
    },

    data() {
        return {
            editing: false,
            editText: ''
        }
    },

    methods: {
        editName() {
            this.editing = true
            // If we already have a profile,
            // initialize the edit text to our existing name
            this.editText = this.profile ? this.profile.name : this.editText
        },

        saveName() {
            if (this.profile) {
                // If we already have a profile, just change the name
                // (this will sync automatically)
                this.profile.name = this.editText
            } else {
                // Otherwise create a profile
                this.$gf.post({
                    type: 'Profile',
                    name: this.editText
                })
            }

            // Exit the editing state
            this.editing = false
        }
    },

    template: '#name'
}
const Like = {
    props: ["messageid"],

    methods: {
        sendLike() {
            this.$gf.post({
                type: "Like",
                object: this.messageid,
                context: [this.messageid]
            });
        },
        toggleLike() {
            if (this.liked) {
                this.removeLike();
            } else {
                this.sendLike();
            }
        },
        removeLike() {
            this.$gf.remove(this.likes.find((l) => l.actor === this.$gf.me));
        }
    },

    setup(props) {
        const $gf = Vue.inject('graffiti')
        const messageid = Vue.toRef(props, 'messageid')
        const {objects: likesRaw} = $gf.useObjects([messageid])
        return {likesRaw}
    },

    computed: {
        likes() {
            return this.likesRaw.filter(
                (m) => m.type && m.type === "Like" && m.object === this.messageid
            )
        },
        liked() {
            // return if the current user has liked this message
            return this.likes.some((l) => l.actor === this.$gf.me)
        }
    },

    template: '#like'

}

const ReadReceipt = {
    props: ["messageid"],

    setup(props) {
        const $gf = Vue.inject('graffiti');
        const messageid = Vue.toRef(props, 'messageid');
        const readerUsernames = Vue.ref([]);
        const {objects: readReceiptsRaw} = $gf.useObjects([messageid]);

        // if the message is not ours and we have not seen it yet, send a read receipt
        return {readReceiptsRaw, readerUsernames};
    },

    created() {
        this.resolver = new Resolver(this.$gf);
    },

    computed: {
        readReceipts() {
            return this.readReceiptsRaw.filter(
                (m) => m.type && m.type === "Read" && m.object === this.messageid && m.actor !== this.$gf.me
            );
        }
    },

    watch: {
        async readReceipts(newReceipts) {
            const filteredReceipts = this.readReceiptsRaw.filter(
                (m) => m.type && m.type === "Read" && m.object === this.messageid && m.actor === this.$gf.me
            );
            if (filteredReceipts.length === 0) {
                this.$gf.post({
                    type: "Read",
                    object: this.messageid,
                    context: [this.messageid]
                });
            }
            this.readerUsernames = await Promise.all(
                filteredReceipts.map(async (receipt) => await this.resolver.actorToUsername(receipt.actor))
            );
        },

    },

    template: '#read-receipt'
}

const Profile = {
    props: ["actor", "editable"],
    setup(props) {
        const {actor} = Vue.toRefs(props)
        const $gf = Vue.inject('graffiti')
        const {objects: objects} = $gf.useObjects([actor])
        return {objects, editable: props.editable}
    },
    data() {
        return {
            editing: false,
            file: null,
            username: '',
            profilePictureUrl: "",
            editable: this.editable
        };
    },
    computed: {
        profile() {
            return this.objects
                .filter(m => m.type && m.type == 'Profile' && m.icon && m.icon.type == 'Image')
                .reduce((prev, curr) => !prev || curr.published > prev.published ? curr : prev, null)
        },
    },
    methods: {
        async getProfilePictureUrl(magnet) {
            const blob = await this.$gf.media.fetch(magnet);
            return URL.createObjectURL(blob);
        },
        editProfile() {
            this.editing = true;
        },
        handleFileUpload(e) {
            this.file = e.target.files[0];
            this.profilePictureUrl = URL.createObjectURL(this.file);
        },
        async saveProfile() {
            if (this.file) {
                const magnet = await this.$gf.media.store(this.file);
                const profileUpdate = {
                    type: "Profile",
                    icon: {
                        type: "Image",
                        magnet: magnet,
                    },
                    name: this.username
                };
                this.$gf.post(profileUpdate);
                this.profilePictureUrl = await this.getProfilePictureUrl(magnet);
            }
            this.editing = false;
        },
    },
    watch: {
        async profile(profile) {
            if (profile && profile.icon && profile.icon.magnet) {
                this.profilePictureUrl = await this.getProfilePictureUrl(profile.icon.magnet);
                this.username = profile.name || '';
            }
        }
    },
    template: '#profile',
};

const Pin = {
    props: ["messageid", "channelid"],

    methods: {
        sendPin() {
            this.$gf.post({
                type: "Pin",
                object: this.messageid,
                context: [this.messageid, this.channelid],
            });
        },
        togglePin() {
            if (this.pinned && this.ownPin) {
                this.removePin();
            } else if (!this.pinned) {
                this.sendPin();
            }
        },
        removePin() {
            this.$gf.remove(this.pin[0]);
        }
    },

    setup(props) {
        const $gf = Vue.inject('graffiti')
        const messageid = Vue.toRef(props, 'messageid')
        const {objects: pinsRaw} = $gf.useObjects([messageid])
        return {pinsRaw}
    },

    computed: {
        pin() {
            return this.pinsRaw.filter(
                (m) => m.type && m.type === "Pin" && m.object === this.messageid
            )
        },
        pinned() {
            // return if any users have pinned this message
            return this.pin.length > 0
        },
        ownPin() {
            // return if the current user has pinned this message
            return this.pin.some((l) => l.actor === this.$gf.me)
        }
    },

    template: '#pin'

}

const PinSearch = {
    props: ["channelid"],
    setup(props) {
        const $gf = Vue.inject('graffiti')
        const channelid = Vue.toRef(props, 'channelid')
        const {objects: pinsRaw} = $gf.useObjects([channelid])
        return {pinsRaw}
    },

    data() {
        return {
            showPinnedMessages: false,
        };
    },
    methods: {
        togglePinnedMessages() {
            this.showPinnedMessages = !this.showPinnedMessages;
        }
    },
    computed: {
        pins() {
            return this.pinsRaw.filter(
                (m) => m.type && m.type === "Pin"
            )
        },
        pinnedMessages() {
            const pinnedObjects = this.pins.map((p) => p.object)
            return this.pinsRaw.filter(
                (m) => pinnedObjects.includes(m.id)
            )
        }
    },
    template: '#pin-search'
}

const TagMessage = {
    props: ["messageid", "channelid", "userid", "messagestring"],
    setup(props) {
        const $gf = Vue.inject('graffiti')
        const messageid = Vue.toRef(props, 'messageid')
        const {objects: tagsRaw} = $gf.useObjects([messageid])
        const userid = Vue.toRef(props, 'userid')
        const {objects: userTags} = $gf.useObjects([userid])
        const messageString = Vue.toRef(props, 'messagestring')
        return {tagsRaw, userTags, messageString}
    },
    data() {
        return {
            tagMenu: false,
        };
    },
    methods: {
        toggleTagMenu() {
            this.tagMenu = !this.tagMenu;
        },
        sendTag(tagString) {
            console.log("sendTag", this.messageString)
            this.$gf.post({
                type: "Tag",
                object: this.messageid,
                tag: tagString,
                content: this.messageString,
                context: [this.messageid, this.channelid, this.userid]
            });
        },
        toggleTag(tagString) {
            console.log("toggleTag", tagString, this.getTag(tagString))
            if (this.getTag(tagString).length > 0) {
                this.removeTag(tagString);
            } else {
                this.sendTag(tagString);
            }
        },
        removeTag(tagString) {
            for (const tag of this.getTag(tagString)) {
                this.$gf.remove(tag);
            }
        },
        getTag(tagString) {
            return this.tags.filter((l) => l.tag === tagString);
        }
    },
    computed: {
        tags() {
            return this.tagsRaw.filter(
                (m) => m.type && m.type === "Tag" && m.object === this.messageid && m.actor === this.$gf.me
            )
        },
        tagNames() {
            console.log("userTags", this.userTags)
            const names = this.userTags.filter((t) => t.type && t.type === "UserTag").map((t) => t.tag)
            console.log("tagNames", names)
            return names
        },
        selectedTags() {
            return this.tags.map((t) => t.tag)
        }
    },
    template: '#tag-message'
}

const UserTags = {
    props: ["userid", 'channelid'],
    data() {
        return {
            newTag: "",
            selectedTags: [],
        }
    },
    setup(props) {
        const $gf = Vue.inject('graffiti')
        const userid = Vue.toRef(props, 'userid')
        const {objects: tagsRaw} = $gf.useObjects([userid])
        const channelid = Vue.toRef(props, 'channelid')
        const {objects: channelTags} = $gf.useObjects([channelid])
        return {tagsRaw, channelTags}
    },
    methods: {
        addTag() {
            if (this.tags.filter((l) => l.tag === this.newTag).length === 0) {
                console.log("adding tag", this.newTag);
                this.$gf.post({
                    type: "UserTag",
                    actor: this.userid,
                    tag: this.newTag,
                    context: [this.userid]
                });
            }
        },
        removeTag(tagString) {
            console.log("removing tag", tagString, this.tags);
            for (const tag of this.tags.filter((l) => l.tag === tagString)) {
                this.$gf.remove(tag);
            }
        },
        selectTag(tagString) {
            //     add tag to selected tags
            //     if tag is already selected, remove it
            if (this.selectedTags.includes(tagString)) {
                this.selectedTags = this.selectedTags.filter((t) => t !== tagString)
            } else {
                this.selectedTags.push(tagString)
            }
            console.log(this.selectedTags)
        },
        tagSelected(tagString) {
            return this.selectedTags.includes(tagString)
        }
    },
    computed: {
        tags() {
            return this.tagsRaw.filter(
                (m) => m.type && m.type === "UserTag" && m.actor === this.userid
            )
        },
        taggedMessages() {
            const validTags = this.tagsRaw.filter(
                (m) => m.type && m.type === "Tag" && m.actor === this.$gf.me && this.selectedTags.includes(m.tag)
            );
            console.log("validTags", validTags.map((t) => t.content));

            const uniqueContents = new Set(validTags.map((t) => t.content));
            return Array.from(uniqueContents);
        }

    },
    template: '#user-tags'
}

const TagSearch = {
    props: ["tag"],
    setup(props) {
        const $gf = Vue.inject('graffiti')
        const tag = Vue.toRef(props, 'tag')
        const {objects: tagsRaw} = $gf.useObjects([tag])
        return {tagsRaw}
    },
    computed: {
        tags() {
            return this.tagsRaw.filter(
                (m) => m.type && m.type === "Tag" && m.tag === this.tag && m.actor === this.$gf.me
            )
        }
    },
    template: '#tagSearch'
}

const Timer = {
    props: ["channelid"],
    setup(props) {
        const $gf = Vue.inject('graffiti')
        const channelid = Vue.toRef(props, 'channelid')
        const {objects: timersRaw} = $gf.useObjects([channelid])
        return {timersRaw}
    },
    methods: {
        sendTimer(timerString) {
            this.$gf.post({
                type: "Timer",
                time: timerString,
                context: [this.channelid]
            });
        }
    },
    computed: {
        timers() {
            return this.timersRaw.filter(
                (m) => m.type && m.type === "Timer"
            )
        },
        finishedTimers() {
            //  convert t.time to a date object
            return this.timers.filter((t) => {
                const time = new Date(t.time);
                return time < new Date();
            });
        }
    },
    template: '#timer'
}

const Groups = {
    props: ["userId"],

    setup(props) {
        const $gf = Vue.inject('graffiti')
        const userId = Vue.toRef(props, 'userId')
        const {objects: groupsRaw} = $gf.useObjects([userId])
        return {groupsRaw}
    },
    methods: {
        addGroup() {
            this.$gf.post({
                type: "Group",
                context: [this.userId]
            });
        }
    },

    computed: {
        groups() {
            return this.groupsRaw.filter(
                (m) => m.type && m.type === "Group" && m.actor === this.userId
            )
        }
    },
    template: '#groups'
}

app.components = {Name, Like, ReadReceipt, Profile, Pin, PinSearch, TagMessage, TagSearch, UserTags, Timer, Groups}
Vue.createApp(app)
    .use(GraffitiPlugin(Vue))
    .mount('#app')
