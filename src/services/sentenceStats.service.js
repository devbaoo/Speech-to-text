const SentenceNewMake = require("../models/sentenceNewMake");
const Sentence = require("../models/sentence");
const SentenceNew = require("../models/sentenceNew");
const NewSentence = require("../models/newSentence");

const TABLES = [
  {
    key: "sentence_new_make",
    model: SentenceNewMake,
    adminCreatedByValues: ["admin", "admin2026@gmail.com"]
  },
  {
    key: "sentence",
    model: Sentence
  },
  {
    key: "sentence_new",
    model: SentenceNew
  },
  {
    key: "new_sentence",
    model: NewSentence
  }
];

const escapeRegExp = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildAdminCreatedFilter = (adminCreatedByValues = ["admin"]) => {
  return {
    $or: [
      { createdBy: null },
      {
        createdBy: {
          $in: adminCreatedByValues.map((value) => new RegExp(`^${escapeRegExp(value)}$`, "i"))
        }
      }
    ]
  };
};

exports.getCreatorTotals = async () => {
  const tableStats = await Promise.all(
    TABLES.map(async ({ key, model, adminCreatedByValues }) => {
      const [total, adminCreated] = await Promise.all([
        model.countDocuments(),
        model.countDocuments(buildAdminCreatedFilter(adminCreatedByValues))
      ]);

      return {
        table: key,
        total,
        adminCreated,
        userCreated: total - adminCreated
      };
    })
  );

  return tableStats.reduce(
    (result, stat) => {
      result.byTable[stat.table] = {
        total: stat.total,
        adminCreated: stat.adminCreated,
        userCreated: stat.userCreated
      };

      result.total += stat.total;
      result.adminCreated += stat.adminCreated;
      result.userCreated += stat.userCreated;

      return result;
    },
    {
      total: 0,
      adminCreated: 0,
      userCreated: 0,
      byTable: {}
    }
  );
};
