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
        const channel = Vue.ref("test");

        // And a flag for whether or not we're private-messaging
        const privateMessaging = Vue.ref(false);

        // If we're private messaging use "me" as the channel,
        // otherwise use the channel value
        const $gf = Vue.inject("graffiti");
        const context = Vue.computed(() =>
            privateMessaging.value ? [$gf.me] : [channel.value]
        );

        // Initialize the collection of messages associated with the context
        const {objects: messagesRaw} = $gf.useObjects(context);
        return {channel, privateMessaging, messagesRaw};
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
        };
    },

    computed: {
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
        async sendMessage() {

            const message = {
                type: "Note",
                content: this.messageText,
            };

            // Reset the value of the input box to the placeholder after the transition
            if (this.messageText !== '') {
                let inputBox = document.getElementById('myInput');
                inputBox.classList.add('move-up');
                setTimeout(() => {
                    inputBox.value = '';
                    inputBox.classList.remove('move-up');
                }, 500);  // 500ms is the duration of the transition
            }
            else {
                console.log('empty');
                let submitButton = document.getElementById('submit');
                submitButton.classList.add('input-error');
                submitButton.value = 'Invalid';
                setTimeout(() => {
                    submitButton.value = 'Send';
                    submitButton.classList.remove('input-error');
                }, 500);  // 500ms is the duration of the transition
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
            // console.log('ERE',this.objects)
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
        const { objects: likesRaw } = $gf.useObjects([messageid])
        return { likesRaw }
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
        const { objects: readReceiptsRaw } = $gf.useObjects([messageid]);

        // if the message is not ours and we have not seen it yet, send a read receipt
        return { readReceiptsRaw, readerUsernames };
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
    data() {
        return {
            editing: false,
            file: null,
            profilePictureUrl: "",
        };
    },
    setup(props) {
        // Get a collection of all objects associated with the actor
        const {actor} = Vue.toRefs(props)
        const $gf = Vue.inject('graffiti')
        return $gf.useObjects([actor])
    },

    computed: {
        profile() {
            console.log('o', this.objects);
            return this.objects
                // Filter the raw objects for profile data
                // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-profile
                .filter(m =>
                    // Does the message have a type property?
                    m.type &&
                    // Is the value of that property 'Profile'?
                    m.type == 'Profile' &&
                    // Does the message have a name property?
                    m.icon &&
                    // Is that property a string?
                    m.icon.type == 'Image')
                // Choose the most recent one or null if none exists
                .reduce((prev, curr) => !prev || curr.published > prev.published ? curr : prev, null)
        }
    },
    methods: {
        async getProfile() {
            console.log('HERE', this.profile);
            if (this.profile && this.profile.icon && this.profile.icon.magnet) {
                this.profilePictureUrl = await this.getProfilePictureUrl();
            }
        },
        async getProfilePictureUrl(magnet) {
            const blob = await this.$gf.media.fetch(magnet);
            return URL.createObjectURL(blob);
        },
        editProfilePicture() {
            this.editing = true;
        },
        handleFileUpload(e) {
            this.file = e.target.files[0];
        },
        async saveProfilePicture() {
            if (this.file) {
                const magnet = await this.$gf.media.store(this.file);
                const profileUpdate = {
                    type: "Profile",
                    icon: {
                        type: "Image",
                        magnet: magnet,
                    }
                };
                await this.$gf.post(profileUpdate);
                this.profilePictureUrl = await this.getProfilePictureUrl(magnet);
            }
            this.editing = false;
        },
    },
    template: '#profile',
};

app.components = {Name, Like, ReadReceipt, Profile}
Vue.createApp(app)
    .use(GraffitiPlugin(Vue))
    .mount('#app')
